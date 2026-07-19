import 'dart:convert';

import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../config.dart';

/// Phase 0 spike #2  [NEEDS 2 REAL DEVICES + the coturn relay - CallKit does not
/// run on the iOS simulator, and background audio needs physical phones].
///
/// The single biggest native bet: a WebRTC 1:1 voice call with CallKit (iOS) /
/// ConnectionService (Android) so audio keeps flowing when the app is
/// backgrounded, with signaling over the server's existing `_ws.ts` hub.
///
/// This is a SKELETON of the moving parts, not a finished call. Mirror the web
/// voice client for the exact peer lifecycle:
///   - roster/offer/answer/ICE:     apps/web-nuxt/server/utils/live/voice.ts
///   - message types over the hub:   voice:roster, voice:signal, voice:evicted,
///                                    voice:peer-reset (the 2nd-tab takeover fix)
///   - ICE servers (STUN + ephemeral TURN creds): GET /api/voice/ice-servers
///
/// Success criteria: two devices hear each other, and audio survives one app
/// being backgrounded / the screen locked (CallKit holds the audio session).
class VoiceProbe {
  WebSocketChannel? _ws;
  RTCPeerConnection? _pc;
  MediaStream? _localStream;

  /// 1. Fetch ICE servers (STUN + short-lived TURN creds) from the API, using
  ///    the bearer token from the auth probe.
  // ignore: unused_element
  Future<Map<String, dynamic>> _iceServers(String bearer) async {
    // TODO: dio GET /api/voice/ice-servers with Authorization: Bearer <token>.
    // Shape: { iceServers: [{ urls, username?, credential? }], ttl }.
    throw UnimplementedError('fetch /api/voice/ice-servers');
  }

  /// 2. Open the signaling socket and join a voice scope (a DM or a league match
  ///    room). The server replies with voice:roster; each peer we then offer/answer.
  Future<void> connect({required String bearer, required String scope}) async {
    _ws = WebSocketChannel.connect(Uri.parse(AppConfig.wsUrl));
    // TODO: authenticate the socket (the web client sends the session on connect;
    // over bearer, pass the token as a query param or first message - confirm
    // against server/routes/_ws.ts upgrade handling).
    _ws!.stream.listen((raw) => _onSignal(jsonDecode(raw as String)));
    _send({'type': 'voice:join', 'scope': scope});
  }

  void _send(Map<String, dynamic> msg) => _ws?.sink.add(jsonEncode(msg));

  /// 3. Handle inbound signaling. Mirror voice.ts: on roster, create a peer +
  ///    offer for each member; relay offer/answer/candidate through voice:signal;
  ///    tear down + rebuild the peer on voice:peer-reset.
  Future<void> _onSignal(Map<String, dynamic> msg) async {
    switch (msg['type']) {
      case 'voice:roster':
        // TODO: for each peer in msg['members'], _makePeer(...) + send an offer.
        break;
      case 'voice:signal':
        // TODO: apply remote SDP (offer -> answer) or addCandidate, per msg['kind'].
        break;
      case 'voice:peer-reset':
        // TODO: close + recreate the peer for msg['userId'] (2nd-tab takeover).
        break;
      case 'voice:evicted':
        await hangUp();
        break;
    }
  }

  /// 4. The WebRTC peer + the mic. secure origin, ICE from step 1.
  // ignore: unused_element
  Future<RTCPeerConnection> _makePeer(Map<String, dynamic> ice) async {
    _localStream ??= await navigator.mediaDevices
        .getUserMedia({'audio': true, 'video': false});
    final pc = await createPeerConnection(ice);
    _localStream!.getTracks().forEach((t) => pc.addTrack(t, _localStream!));
    pc.onIceCandidate = (c) => _send({'type': 'voice:signal', 'kind': 'candidate', 'candidate': c.toMap()});
    pc.onTrack = (e) {/* attach e.streams[0] to an audio sink */};
    return pc;
  }

  /// 5. CallKit / ConnectionService - the reason for the whole spike. Show the
  ///    native call UI so the OS grants a foreground audio session that survives
  ///    backgrounding. On accept, run connect() above.
  Future<void> showIncoming({required String id, required String caller}) async {
    await FlutterCallkitIncoming.showCallkitIncoming(CallKitParams(
      id: id,
      nameCaller: caller,
      handle: 'Nostragoalus',
      type: 0, // audio
      textAccept: 'Accept',
      textDecline: 'Decline',
      android: const AndroidParams(isCustomNotification: true, isShowFullLockedScreen: true),
      ios: const IOSParams(handleType: 'generic', supportsHolding: true),
    ));
    // TODO: FlutterCallkitIncoming.onEvent -> on ACCEPT call connect(); on DECLINE hangUp().
  }

  Future<void> hangUp() async {
    await _pc?.close();
    await _localStream?.dispose();
    await _ws?.sink.close();
  }
}
