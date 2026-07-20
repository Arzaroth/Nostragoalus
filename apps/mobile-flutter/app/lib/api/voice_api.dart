import 'api_client.dart';
import 'models.gen.dart';

/// Voice mesh transport config.
extension VoiceApi on ApiClient {
  /// ICE/TURN servers plus the credential ttl (seconds): the voice layer re-arms
  /// its refresh from that ttl, so dropping it would pin a guessed lifetime.
  Future<IceServersResponse> iceServers() async =>
      IceServersResponse.fromJson(await getJson('/api/voice/ice-servers'));
}
