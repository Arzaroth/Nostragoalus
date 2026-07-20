import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Headless stand-ins for the WebRTC objects, so the mesh logic is testable
/// without a device. Everything the service does not touch is left to
/// noSuchMethod.

class FakeTrack implements MediaStreamTrack {
  FakeTrack(this.id);
  @override
  final String id;
  @override
  bool enabled = true;
  bool stopped = false;

  @override
  Future<void> stop() async => stopped = true;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FakeStream implements MediaStream {
  final tracks = [FakeTrack('audio-1')];
  bool disposed = false;

  @override
  List<MediaStreamTrack> getTracks() => tracks;

  @override
  List<MediaStreamTrack> getAudioTracks() => tracks;

  @override
  Future<void> dispose() async => disposed = true;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FakeSender implements RTCRtpSender {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FakePeer implements RTCPeerConnection {
  FakePeer(this.config);
  Map<String, dynamic> config;

  /// Every configuration pushed after construction (the TURN refresh path).
  final reconfigured = <Map<String, dynamic>>[];

  @override
  Future<void> setConfiguration(Map<String, dynamic> configuration) async {
    config = configuration;
    reconfigured.add(configuration);
  }

  @override
  Function(RTCIceCandidate candidate)? onIceCandidate;
  @override
  Function(RTCTrackEvent event)? onTrack;

  final addedTracks = <MediaStreamTrack>[];
  final candidates = <RTCIceCandidate>[];
  final descriptions = <String>[];
  bool closed = false;

  @override
  Future<RTCSessionDescription> createOffer([Map<String, dynamic>? constraints]) async =>
      RTCSessionDescription('sdp-offer', 'offer');

  @override
  Future<RTCSessionDescription> createAnswer([Map<String, dynamic>? constraints]) async =>
      RTCSessionDescription('sdp-answer', 'answer');

  @override
  Future<void> setLocalDescription(RTCSessionDescription description) async =>
      descriptions.add('local:${description.type}');

  @override
  Future<void> setRemoteDescription(RTCSessionDescription description) async =>
      descriptions.add('remote:${description.type}');

  @override
  Future<void> addCandidate(RTCIceCandidate candidate) async => candidates.add(candidate);

  @override
  Future<RTCRtpSender> addTrack(MediaStreamTrack track, [MediaStream? stream]) async {
    addedTracks.add(track);
    return FakeSender();
  }

  @override
  Future<void> close() async => closed = true;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
