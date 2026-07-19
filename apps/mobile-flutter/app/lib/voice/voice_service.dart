import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:web_socket_channel/io.dart';

import '../api/nostragoalus_api.dart';
import '../api/token_store.dart';
import '../config.dart';
import 'voice_mesh.dart';

/// A voice room to join (a league room, or a 1:1 DM call).
class VoiceScope {
  const VoiceScope({required this.kind, this.leagueId, this.matchId, this.threadId});
  final String kind; // 'league' | 'dm'
  final String? leagueId;
  final String? matchId;
  final String? threadId;

  factory VoiceScope.fromJson(Map<String, dynamic> j) => VoiceScope(
        kind: (j['kind'] ?? 'dm').toString(),
        leagueId: j['leagueId'] as String?,
        matchId: j['matchId'] as String?,
        threadId: j['threadId'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'kind': kind,
        if (leagueId != null) 'leagueId': leagueId,
        if (matchId != null) 'matchId': matchId,
        if (threadId != null) 'threadId': threadId,
      };
}

/// WebRTC mesh voice over the server signaling hub (voice:* frames). One
/// RTCPeerConnection per peer; the deterministic offerer avoids glare. Audio
/// only; the remote tracks play through the device automatically.
class VoiceService {
  VoiceService(this._api, this._tokens, this._selfId);

  final NostragoalusApi _api;
  final TokenStore _tokens;
  final String _selfId;

  IOWebSocketChannel? _socket;
  MediaStream? _local;
  Map<String, dynamic>? _iceConfig;
  VoiceScope? _scope;
  final Map<String, RTCPeerConnection> _peers = {};

  /// Current participant ids (incl. self) and mute state, for the call bar.
  final ValueNotifier<List<String>> roster = ValueNotifier(const []);
  final ValueNotifier<bool> muted = ValueNotifier(false);
  final ValueNotifier<bool> inCall = ValueNotifier(false);

  bool get isActive => _scope != null;

  Future<void> join(VoiceScope scope) async {
    if (_scope != null) await leave();
    _scope = scope;
    _iceConfig = {'iceServers': await _api.iceServers()};
    _local = await navigator.mediaDevices.getUserMedia({'audio': true, 'video': false});
    _openSocket();
    inCall.value = true;
  }

  /// Place an outgoing call: join the scope, then ring the given users so they
  /// get a voice:ring push.
  Future<void> invite(VoiceScope scope, List<String> userIds) async {
    await join(scope);
    _send({'type': 'voice:invite', 'scope': scope.toJson(), 'userIds': userIds});
  }

  void _openSocket() {
    final token = _tokens.token;
    final headers = token != null ? {'Authorization': 'Bearer $token'} : null;
    final socket = IOWebSocketChannel.connect(Uri.parse(AppConfig.wsUrl), headers: headers);
    _socket = socket;
    socket.stream.listen(_onFrame, onDone: leave, onError: (_) => leave(), cancelOnError: true);
    _send({'type': 'voice:join', 'scope': _scope!.toJson()});
  }

  Future<void> _onFrame(dynamic data) async {
    final frame = jsonDecode(data as String);
    if (frame is! Map<String, dynamic>) return;
    switch (frame['type']) {
      case 'voice:roster':
        await _applyRoster(((frame['roster'] as List?) ?? const []).cast<String>());
      case 'voice:signal':
        await _onSignal(frame['from'] as String, frame['kind'] as String, frame['payload']);
      case 'voice:ended':
      case 'voice:evicted':
        await leave();
      case 'voice:peer-reset':
        final id = frame['from'];
        if (id is String) await _dropPeer(id);
    }
  }

  Future<void> _applyRoster(List<String> ids) async {
    roster.value = ids;
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

    final pc = await createPeerConnection(_iceConfig ?? {});
    _peers[peerId] = pc;
    for (final track in _local?.getTracks() ?? const []) {
      await pc.addTrack(track, _local!);
    }
    pc.onIceCandidate = (c) {
      if (c.candidate == null) return;
      _send({
        'type': 'voice:signal',
        'to': peerId,
        'kind': 'candidate',
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
      _send({
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
        _send({
          'type': 'voice:signal',
          'to': from,
          'kind': 'answer',
          'payload': {'sdp': answer.sdp, 'type': answer.type},
        });
      case 'answer':
        await pc.setRemoteDescription(RTCSessionDescription(p['sdp'] as String, p['type'] as String));
      case 'candidate':
        await pc.addCandidate(
            RTCIceCandidate(p['candidate'] as String?, p['sdpMid'] as String?, p['sdpMLineIndex'] as int?));
    }
  }

  Future<void> _dropPeer(String peerId) async {
    final pc = _peers.remove(peerId);
    await pc?.close();
  }

  void toggleMute() {
    muted.value = !muted.value;
    for (final t in _local?.getAudioTracks() ?? const []) {
      t.enabled = !muted.value;
    }
  }

  void _send(Map<String, dynamic> message) {
    try {
      _socket?.sink.add(jsonEncode(message));
    } catch (_) {/* socket closing */}
  }

  Future<void> leave() async {
    if (_scope == null) return;
    _send({'type': 'voice:leave', 'scope': _scope!.toJson()});
    for (final pc in _peers.values) {
      await pc.close();
    }
    _peers.clear();
    for (final t in _local?.getTracks() ?? const []) {
      await t.stop();
    }
    await _local?.dispose();
    await _socket?.sink.close();
    _local = null;
    _socket = null;
    _scope = null;
    roster.value = const [];
    muted.value = false;
    inCall.value = false;
  }

  void dispose() {
    leave();
    roster.dispose();
    muted.dispose();
    inCall.dispose();
  }
}
