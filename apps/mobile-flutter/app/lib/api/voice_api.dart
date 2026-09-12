import 'api_client.dart';
import 'models.gen.dart';

/// Voice mesh transport config.
extension VoiceApi on ApiClient {
  /// ICE/TURN servers plus the credential ttl (seconds): the voice layer re-arms
  /// its refresh from that ttl, so dropping it would pin a guessed lifetime.
  Future<IceServersResponse> iceServers() async =>
      IceServersResponse.fromJson(await getJson('/api/voice/ice-servers'));

  /// Recent calls of one chat scope, oldest first, for the chat's call lines.
  /// Authorization mirrors joining the call itself, so a non-member 404s.
  Future<CallLogResponse> voiceCalls({String? leagueId, String? dmThreadId}) async =>
      CallLogResponse.fromJson(await getJson('/api/voice/calls', query: {
        if (leagueId != null) 'leagueId': leagueId,
        if (dmThreadId != null) 'dmThreadId': dmThreadId,
      }));
}
