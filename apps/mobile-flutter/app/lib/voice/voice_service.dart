import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../api/models.gen.dart' show IceServersResponse;
import '../api/nostragoalus_api.dart';
import '../api/token_store.dart';
import '../live/live_service.dart';
import 'voice_call_state.dart';
import 'voice_mesh.dart';

export 'voice_call_state.dart';

typedef VoiceMediaFactory = Future<MediaStream> Function();
typedef VoicePeerFactory = Future<RTCPeerConnection> Function(Map<String, dynamic> config);
typedef IceFetcher = Future<IceServersResponse> Function();

/// What the server hands out when nothing else says otherwise
/// (`buildIceServers`'s `ttlSeconds` default). Only used because the api facade
/// drops the response's `ttl`; see the handoff note.
const _fallbackIceTtlSeconds = 3600.0;

/// A `join()` that never got off the ground. `micDenied` separates the one
/// failure the user can act on from everything else.
class VoiceJoinException implements Exception {
  const VoiceJoinException(this.micDenied, this.cause);
  final bool micDenied;
  final Object cause;

  @override
  String toString() => 'VoiceJoinException(micDenied: $micDenied, $cause)';
}

Future<MediaStream> _defaultMedia() =>
    navigator.mediaDevices.getUserMedia({'audio': true, 'video': false});

/// WebRTC mesh voice over the server signaling hub (voice:* frames). One
/// RTCPeerConnection per peer; the deterministic offerer avoids glare. Audio
/// only; the remote tracks play through the device automatically.
///
/// Signaling rides the shared [LiveService] socket (see [attach]): the server
/// seats one socket per user per room and ref-counts presence per connection,
/// so a second socket of our own would fight the first.
class VoiceService {
  /// `tokens` is unused since the signaling moved onto the shared LiveService
  /// socket; the positional slot stays until providers.dart drops the argument.
  VoiceService(
    this._api,
    // ignore: avoid_unused_constructor_parameters
    TokenStore tokens,
    this._selfId, {
    VoiceMediaFactory? media,
    VoicePeerFactory? peers,
    IceFetcher? ice,
    this.ringTimeout = const Duration(seconds: 30),
    this.reconnectGrace = const Duration(seconds: 20),
    this.iceRetry = const Duration(seconds: 30),
  })  : _media = media ?? _defaultMedia,
        _peerFactory = peers ?? createPeerConnection,
        _ice = ice;

  final NostragoalusApi _api;
  final String _selfId;
  final VoiceMediaFactory _media;
  final VoicePeerFactory _peerFactory;
  final IceFetcher? _ice;

  /// How soon to try again when refreshing the TURN credential fails. The old
  /// credential is kept meanwhile: it is usually still inside its own ttl.
  final Duration iceRetry;

  /// How long an unanswered outgoing ring lasts (matches the web's
  /// RING_TIMEOUT_MS) and how long a dropped socket may take to come back
  /// before the call is declared lost.
  final Duration ringTimeout;
  final Duration reconnectGrace;

  LiveService? _live;
  StreamSubscription<LiveFrame>? _frameSub;
  MediaStream? _local;
  Map<String, dynamic>? _iceConfig;
  final Map<String, RTCPeerConnection> _peers = {};
  final Set<String> _pendingInvites = {};
  Timer? _ringTimer;
  Timer? _reconnectTimer;
  Timer? _iceTimer;
  bool _disposed = false;

  /// The whole call in one value, for the call bar.
  final ValueNotifier<VoiceCallState> state = ValueNotifier(const VoiceIdle());

  VoiceScope? get activeScope => state.value.scope;

  /// Bind the shared hub socket. Called once by the app shell; a join before it
  /// throws rather than silently opening a second connection.
  void attach(LiveService live) {
    if (identical(_live, live)) return;
    unawaited(_frameSub?.cancel());
    _live = live;
    _frameSub = live.frames.listen(_onFrame);
  }

  Future<void> join(VoiceScope scope) async {
    final live = _live;
    if (live == null) throw StateError('VoiceService.attach() was not called');
    if (state.value.scope != null) await leave();
    _set(VoiceConnecting(scope));
    var atMic = false;
    try {
      // A call with no STUN/TURN fails mysteriously behind NAT minutes later;
      // fail here instead.
      await _loadIce();
      atMic = true;
      _local = await _media();
      atMic = false;
      live.connect();
      live.send({'type': 'voice:join', 'scope': scope.toJson()});
      _set(VoiceInCall(scope: scope, roster: const [], muted: false, startedAt: DateTime.now()));
    } catch (e) {
      await _teardown(VoiceEndReason.failed);
      throw VoiceJoinException(atMic, e);
    }
  }

  /// Place an outgoing call: join the scope, then ring the given users so they
  /// get a voice:ring push. An unanswered ring is cancelled after [ringTimeout]
  /// so the callee's phone stops ringing and the miss gets logged.
  Future<void> invite(VoiceScope scope, List<String> userIds) async {
    await join(scope);
    _pendingInvites
      ..clear()
      ..addAll(userIds.where((id) => id != _selfId));
    _live?.send({'type': 'voice:invite', 'scope': scope.toJson(), 'userIds': userIds});
    _ringTimer?.cancel();
    _ringTimer = Timer(ringTimeout, () => unawaited(_teardown(VoiceEndReason.cancelled)));
  }

  Future<void> leave() => _teardown(VoiceEndReason.hangUp);

  /// The app left the foreground. Nostragoalus ships no foreground service /
  /// CallKit, so the OS suspends the microphone here: the call ends instead of
  /// staying listed with a dead mic. Returns true when a call was actually
  /// ended, so the shell can tell the user why on the way back.
  Future<bool> backgrounded() async {
    if (state.value.scope == null) return false;
    await _teardown(VoiceEndReason.backgrounded);
    return true;
  }

  void toggleMute() {
    final current = state.value;
    if (current is! VoiceInCall) return;
    final muted = !current.muted;
    _set(current.copyWith(muted: muted));
    for (final t in _local?.getAudioTracks() ?? const <MediaStreamTrack>[]) {
      t.enabled = !muted;
    }
  }

  /// Fetch the ICE configuration and arm the refresh that keeps it valid. The
  /// TURN credential the server mints is time-limited, so a call that outlives
  /// its ttl would lose the relay on the next renegotiation or ICE restart.
  Future<void> _loadIce() async {
    final res = _ice != null
        ? await _ice()
        : IceServersResponse(iceServers: await _api.iceServers(), ttl: _fallbackIceTtlSeconds);
    if (res.iceServers.isEmpty) throw StateError('no ICE servers configured');
    _iceConfig = {'iceServers': res.iceServers.map((s) => s.toJson()).toList()};
    // 90% of the ttl, matching the web (useVoiceCall.ensureIce).
    _armIceTimer(Duration(milliseconds: (res.ttl * 900).round()));
  }

  void _armIceTimer(Duration delay) {
    _iceTimer?.cancel();
    _iceTimer = delay > Duration.zero ? Timer(delay, () => unawaited(_refreshIce())) : null;
  }

  Future<void> _refreshIce() async {
    if (state.value.scope == null) return;
    try {
      await _loadIce();
      // Live peers keep their old credential until told otherwise, so an ICE
      // restart on this connection would still try to relay with a dead one.
      for (final pc in _peers.values) {
        await pc.setConfiguration(_iceConfig!);
      }
    } catch (_) {
      // A blip must not drop a live call: keep the credential we have and try
      // again shortly, before it lapses.
      _armIceTimer(iceRetry);
    }
  }

  Future<void> _onFrame(LiveFrame frame) async {
    switch (frame['type']) {
      case 'live:closed':
        _onSocketLost();
      case 'live:open':
        await _onSocketBack();
      case 'voice:roster':
        if (!_isOurScope(frame['scope'])) return;
        await _applyRoster(((frame['roster'] as List?) ?? const []).cast<String>());
      case 'voice:signal':
        if (state.value.scope == null) return;
        await _onSignal(frame['from'] as String, frame['kind'] as String, frame['payload']);
      case 'voice:ended':
        await _teardown(VoiceEndReason.ended, notifyServer: false);
      case 'voice:evicted':
        await _teardown(VoiceEndReason.evicted, notifyServer: false);
      case 'voice:declined':
        await _onDeclined(frame['from']);
      case 'voice:peer-reset':
        // A takeover leaves the roster userIds unchanged, so the next roster
        // frame carries no delta: rebuild the link here or it is gone for good.
        final id = frame['userId'];
        if (id is String && state.value.scope != null) {
          await _dropPeer(id);
          await _ensurePeer(id);
        }
    }
  }

  bool _isOurScope(dynamic raw) {
    final scope = state.value.scope;
    if (scope == null || raw is! Map) return false;
    return VoiceScope.fromJson(raw.cast<String, dynamic>()) == scope;
  }

  void _onSocketLost() {
    final current = state.value;
    if (current is! VoiceInCall && current is! VoiceConnecting) return;
    final scope = current.scope!;
    _set(VoiceConnecting(scope,
        reconnecting: true, muted: current is VoiceInCall ? current.muted : false));
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(
      reconnectGrace,
      () => unawaited(_teardown(VoiceEndReason.networkLost, notifyServer: false)),
    );
  }

  Future<void> _onSocketBack() async {
    final current = state.value;
    if (current is! VoiceConnecting || !current.reconnecting) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    // The server ended our room membership when the old socket closed, so every
    // peer link is dead; the fresh roster rebuilds them.
    for (final id in _peers.keys.toList()) {
      await _dropPeer(id);
    }
    _live?.send({'type': 'voice:join', 'scope': current.scope.toJson()});
    _set(VoiceInCall(
        scope: current.scope, roster: const [], muted: current.muted, startedAt: DateTime.now()));
  }

  Future<void> _onDeclined(dynamic from) async {
    final current = state.value;
    if (from is! String || current is! VoiceInCall) return;
    _pendingInvites.remove(from);
    if (_pendingInvites.isEmpty && !current.established) {
      await _teardown(VoiceEndReason.declined);
    }
  }

  Future<void> _applyRoster(List<String> ids) async {
    final current = state.value;
    if (current is! VoiceInCall) return;
    _set(current.copyWith(roster: ids));
    _pendingInvites.removeAll(ids);
    if (_pendingInvites.isEmpty) {
      _ringTimer?.cancel();
      _ringTimer = null;
    }
    final delta = rosterDelta(_peers.keys, ids, _selfId);
    for (final id in delta.added) {
      await _ensurePeer(id);
    }
    for (final id in delta.removed) {
      await _dropPeer(id);
    }
  }

  Future<RTCPeerConnection> _ensurePeer(String peerId) async {
    final existing = _peers[peerId];
    if (existing != null) return existing;

    final pc = await _peerFactory(_iceConfig ?? const {});
    _peers[peerId] = pc;
    for (final track in _local?.getTracks() ?? const <MediaStreamTrack>[]) {
      await pc.addTrack(track, _local!);
    }
    pc.onIceCandidate = (c) {
      if (c.candidate == null) return;
      _live?.send({
        'type': 'voice:signal',
        'to': peerId,
        'kind': 'ice',
        'payload': {
          'candidate': c.candidate,
          'sdpMid': c.sdpMid,
          'sdpMLineIndex': c.sdpMLineIndex,
        },
      });
    };
    // Received remote audio plays through the device automatically.
    pc.onTrack = (_) {};

    if (shouldOffer(_selfId, peerId)) {
      final offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      _live?.send({
        'type': 'voice:signal',
        'to': peerId,
        'kind': 'offer',
        'payload': {'sdp': offer.sdp, 'type': offer.type},
      });
    }
    return pc;
  }

  Future<void> _onSignal(String from, String kind, dynamic payload) async {
    final pc = await _ensurePeer(from);
    final p = (payload as Map).cast<String, dynamic>();
    switch (kind) {
      case 'offer':
        await pc.setRemoteDescription(RTCSessionDescription(p['sdp'] as String, p['type'] as String));
        final answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        _live?.send({
          'type': 'voice:signal',
          'to': from,
          'kind': 'answer',
          'payload': {'sdp': answer.sdp, 'type': answer.type},
        });
      case 'answer':
        await pc.setRemoteDescription(RTCSessionDescription(p['sdp'] as String, p['type'] as String));
      case 'ice':
        await pc.addCandidate(
            RTCIceCandidate(p['candidate'] as String?, p['sdpMid'] as String?, p['sdpMLineIndex'] as int?));
    }
  }

  Future<void> _dropPeer(String peerId) async {
    final pc = _peers.remove(peerId);
    await pc?.close();
  }

  Future<void> _teardown(VoiceEndReason reason, {bool notifyServer = true}) async {
    final scope = state.value.scope;
    if (scope == null) return;
    // Publish the terminal state BEFORE the first await: the notifier may be
    // disposed while the teardown below is still running.
    _set(VoiceEnding(reason));
    _ringTimer?.cancel();
    _ringTimer = null;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _iceTimer?.cancel();
    _iceTimer = null;
    if (notifyServer) {
      // An unanswered ring is cancelled, not just left: that is what makes the
      // callee's phone stop and records the missed call.
      for (final id in _pendingInvites) {
        _live?.send({'type': 'voice:cancel', 'scope': scope.toJson(), 'to': id});
      }
      _live?.send({'type': 'voice:leave'});
    }
    _pendingInvites.clear();
    for (final pc in _peers.values) {
      await pc.close();
    }
    _peers.clear();
    for (final t in _local?.getTracks() ?? const <MediaStreamTrack>[]) {
      await t.stop();
    }
    await _local?.dispose();
    _local = null;
    _iceConfig = null;
    _set(const VoiceIdle());
  }

  void _set(VoiceCallState next) {
    if (_disposed) return;
    state.value = next;
  }

  Future<void> dispose() async {
    await _teardown(VoiceEndReason.hangUp);
    _disposed = true;
    await _frameSub?.cancel();
    _frameSub = null;
    state.dispose();
  }
}
