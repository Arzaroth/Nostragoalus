import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:web_socket_channel/io.dart';

import '../config.dart';
import '../api/token_store.dart';

/// A frame from the server hub, already decoded. `type` selects the handler.
typedef LiveFrame = Map<String, dynamic>;

/// Emitted on every successful (re)connect, so consumers can restate whatever
/// the server forgot while they were disconnected (the voice room, mainly).
const LiveFrame liveOpenFrame = {'type': 'live:open'};

/// Emitted when the socket drops, before the backoff reconnect starts.
const LiveFrame liveClosedFrame = {'type': 'live:closed'};

/// The socket LiveService talks over. An indirection so tests can drive frames
/// without a server.
abstract class LiveChannel {
  Stream<dynamic> get stream;
  void send(String data);
  Future<void> close();
}

typedef LiveChannelFactory = LiveChannel Function(Uri url, Map<String, String>? headers);

class _IoLiveChannel implements LiveChannel {
  _IoLiveChannel(this._channel);
  final IOWebSocketChannel _channel;

  @override
  Stream<dynamic> get stream => _channel.stream;

  @override
  void send(String data) => _channel.sink.add(data);

  @override
  Future<void> close() async => _channel.sink.close();
}

LiveChannel _connectIo(Uri url, Map<String, String>? headers) =>
    _IoLiveChannel(IOWebSocketChannel.connect(url, headers: headers));

/// Capped exponential backoff with up to a third of the delay as jitter, so a
/// server restart does not bring every installed client back in one thundering
/// herd (and does not have them hammering a flat retry forever either).
Duration liveRetryDelay(int attempt, {required Duration base, required Duration cap, required Random random}) {
  final grown = base.inMilliseconds * (1 << min(attempt < 0 ? 0 : attempt, 20));
  final capped = min(grown, cap.inMilliseconds);
  return Duration(milliseconds: capped + random.nextInt(max(1, capped ~/ 3)));
}

/// Persistent connection to the server WebSocket hub (server/routes/_ws.ts).
/// Authenticates the handshake with the bearer token (the hub calls
/// `auth.api.getSession` on the request headers), subscribes to a set of match
/// ids, reports the one match being viewed, and restates both on every
/// reconnect. Exposes decoded frames as a broadcast stream; callers filter by
/// `frame['type']` (match:update, scores:changed, voice:*, ...).
///
/// This is the app's ONLY hub socket: voice signaling rides it too (see
/// VoiceService.attach), because the server ref-counts presence and seats one
/// socket per user per voice room.
class LiveService {
  LiveService(
    this._tokens, {
    LiveChannelFactory? channelFactory,
    this.heartbeatInterval = const Duration(seconds: 25),
    this.heartbeatTimeout = const Duration(seconds: 10),
    this.retryBase = const Duration(seconds: 1),
    this.retryCap = const Duration(seconds: 30),
    Random? random,
  })  : _connectChannel = channelFactory ?? _connectIo,
        _random = random ?? Random();

  final TokenStore _tokens;
  final LiveChannelFactory _connectChannel;
  final Random _random;

  /// Keepalive cadence, under a typical carrier NAT idle timeout, and how long
  /// a pong may take before the socket counts as half-open (see
  /// apps/web-nuxt/app/utils/heartbeat.ts).
  final Duration heartbeatInterval;
  final Duration heartbeatTimeout;
  final Duration retryBase;
  final Duration retryCap;

  final _frames = StreamController<LiveFrame>.broadcast();
  LiveChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Set<String> _matchIds = {};
  String? _viewing;
  Timer? _retry;
  Timer? _beat;
  Timer? _watchdog;
  int _attempt = 0;
  bool _disposed = false;

  Stream<LiveFrame> get frames => _frames.stream;

  bool get isConnected => _channel != null;

  /// Idempotent: a second call while a socket is live is a no-op instead of
  /// leaking the previous channel and double-delivering every frame.
  void connect() {
    if (_disposed || _channel != null) return;
    _retry?.cancel();
    final token = _tokens.token;
    final headers = token != null ? {'Authorization': 'Bearer $token'} : null;
    try {
      final channel = _connectChannel(Uri.parse(AppConfig.wsUrl), headers);
      _channel = channel;
      _sub = channel.stream.listen(
        _onData,
        onDone: _onClosed,
        onError: (_) => _onClosed(),
        cancelOnError: true,
      );
      _startHeartbeat();
      if (_matchIds.isNotEmpty) _send({'type': 'subscribe', 'matchIds': _matchIds.toList()});
      if (_viewing != null) _send({'type': 'viewing', 'matchId': _viewing});
      _emit(liveOpenFrame);
    } catch (_) {
      _channel = null;
      _scheduleReconnect();
    }
  }

  /// Send a frame over the always-on socket (voice signaling, chat:typing,
  /// voice:decline for a ringing call the user hasn't joined yet).
  void send(Map<String, dynamic> message) => _send(message);

  /// Replace the set of watched matches (and push it to the server).
  void subscribe(Set<String> matchIds) {
    if (matchIds.length == _matchIds.length && matchIds.containsAll(_matchIds)) return;
    _matchIds = matchIds;
    _send({'type': 'subscribe', 'matchIds': matchIds.toList()});
  }

  /// Report the one match this client is watching. This, and not `subscribe`,
  /// is what the server counts into a match's "N watching now" room. A null id
  /// clears the client from its room.
  void viewing(String? matchId) {
    if (_viewing == matchId) return;
    _viewing = matchId;
    _send({'type': 'viewing', 'matchId': matchId ?? ''});
  }

  /// Close the socket but keep the service usable. Used on sign-out, so the
  /// next sign-in does not keep a socket authenticated as the previous user.
  void disconnect() {
    _retry?.cancel();
    _attempt = 0;
    _dropChannel();
  }

  void dispose() {
    _disposed = true;
    disconnect();
    _frames.close();
  }

  void _onData(dynamic data) {
    // Any frame proves the socket is alive, so the next drop starts its backoff
    // from zero instead of inheriting the previous outage's delay.
    _attempt = 0;
    try {
      final decoded = jsonDecode(data as String);
      if (decoded is! Map<String, dynamic>) return;
      if (decoded['type'] == 'pong') {
        _watchdog?.cancel();
        _watchdog = null;
        return;
      }
      _emit(decoded);
    } catch (_) {
      // ignore malformed frames
    }
  }

  void _emit(LiveFrame frame) {
    if (_disposed || _frames.isClosed) return;
    _frames.add(frame);
  }

  void _onClosed() {
    if (_channel == null) return;
    _dropChannel();
    _emit(liveClosedFrame);
    _scheduleReconnect();
  }

  void _dropChannel() {
    _stopHeartbeat();
    final channel = _channel;
    _channel = null;
    _sub?.cancel();
    _sub = null;
    if (channel != null) unawaited(channel.close());
  }

  void _send(Map<String, dynamic> message) {
    try {
      _channel?.send(jsonEncode(message));
    } catch (_) {
      // A closed sink just means the next connect() will restate on open.
    }
  }

  void _scheduleReconnect() {
    if (_disposed || (_retry?.isActive ?? false)) return;
    final delay = liveRetryDelay(_attempt, base: retryBase, cap: retryCap, random: _random);
    _attempt += 1;
    _retry = Timer(delay, connect);
  }

  void _startHeartbeat() {
    _stopHeartbeat();
    _beat = Timer.periodic(heartbeatInterval, (_) => _ping());
  }

  void _stopHeartbeat() {
    _beat?.cancel();
    _beat = null;
    _watchdog?.cancel();
    _watchdog = null;
  }

  void _ping() {
    // One watchdog at a time, so a dead socket is declared after a single
    // timeout instead of having each fresh beat extend it.
    if (_watchdog?.isActive ?? false) return;
    _send({'type': 'ping'});
    _watchdog = Timer(heartbeatTimeout, () {
      _watchdog = null;
      _forceReconnect();
    });
  }

  /// A half-open socket (carrier dropped the NAT mapping) never fires onDone,
  /// so nothing else would ever notice it went silent.
  void _forceReconnect() {
    if (_disposed) return;
    _dropChannel();
    _emit(liveClosedFrame);
    _attempt = 0;
    connect();
  }
}
