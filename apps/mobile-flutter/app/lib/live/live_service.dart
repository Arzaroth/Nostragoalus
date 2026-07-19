import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/io.dart';

import '../config.dart';
import '../api/token_store.dart';

/// A frame from the server hub, already decoded. `type` selects the handler.
typedef LiveFrame = Map<String, dynamic>;

/// Persistent connection to the server WebSocket hub (server/routes/_ws.ts).
/// Authenticates the handshake with the bearer token (the hub calls
/// `auth.api.getSession` on the request headers), subscribes to a set of match
/// ids, and re-subscribes on every reconnect. Exposes decoded frames as a
/// broadcast stream; callers filter by `frame['type']` (match:update,
/// scores:changed, notification:new, reaction:update, ...).
class LiveService {
  LiveService(this._tokens);

  final TokenStore _tokens;
  final _frames = StreamController<LiveFrame>.broadcast();
  IOWebSocketChannel? _channel;
  Set<String> _matchIds = {};
  Timer? _retry;
  bool _disposed = false;

  Stream<LiveFrame> get frames => _frames.stream;

  void connect() {
    if (_disposed) return;
    _retry?.cancel();
    final token = _tokens.token;
    final headers = token != null ? {'Authorization': 'Bearer $token'} : null;
    try {
      final channel = IOWebSocketChannel.connect(Uri.parse(AppConfig.wsUrl), headers: headers);
      _channel = channel;
      channel.stream.listen(
        (data) {
          final decoded = jsonDecode(data as String);
          if (decoded is Map<String, dynamic>) _frames.add(decoded);
        },
        onDone: _scheduleReconnect,
        onError: (_) => _scheduleReconnect(),
        cancelOnError: true,
      );
      if (_matchIds.isNotEmpty) _send({'type': 'subscribe', 'matchIds': _matchIds.toList()});
    } catch (_) {
      _scheduleReconnect();
    }
  }

  /// Send a frame over the always-on socket (e.g. voice:decline for a ringing
  /// call the user hasn't joined yet).
  void send(Map<String, dynamic> message) => _send(message);

  /// Replace the set of watched matches (and push it to the server).
  void subscribe(Set<String> matchIds) {
    if (matchIds.length == _matchIds.length && matchIds.containsAll(_matchIds)) return;
    _matchIds = matchIds;
    _send({'type': 'subscribe', 'matchIds': matchIds.toList()});
  }

  void _send(Map<String, dynamic> message) {
    try {
      _channel?.sink.add(jsonEncode(message));
    } catch (_) {
      // A closed sink just means the next connect() will re-send on open.
    }
  }

  void _scheduleReconnect() {
    if (_disposed || (_retry?.isActive ?? false)) return;
    _retry = Timer(const Duration(seconds: 3), connect);
  }

  void dispose() {
    _disposed = true;
    _retry?.cancel();
    _channel?.sink.close();
    _frames.close();
  }
}
