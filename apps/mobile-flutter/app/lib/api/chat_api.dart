import 'api_client.dart';
import 'models.gen.dart';

/// End-to-end encrypted league chat: the device identity and its escrow, the
/// sealed group keys, ciphertext in and out, reactions, edits and moderation.
/// Everything here moves ciphertext - the server never sees a plaintext message.
extension ChatApi on ApiClient {
  Future<ChatIdentityResponse> chatIdentity() async =>
      ChatIdentityResponse.fromJson(await getJson('/api/chat/identity'));

  Future<void> registerIdentity(String publicKey) async =>
      putJson('/api/chat/identity', body: {'publicKey': publicKey});

  /// Hard-reset the chat identity to a fresh keypair, revoking old sealed keys.
  Future<void> resetChatIdentity(String publicKey) async =>
      postJson('/api/chat/identity/reset', body: {'publicKey': publicKey});

  Future<String?> chatRecoveryBlob() async =>
      ChatRecoveryResponse.fromJson(await getJson('/api/chat/recovery')).blob;

  Future<void> setChatRecovery(String blob) async =>
      putJson('/api/chat/recovery', body: {'blob': blob});

  Future<ChatStatusResponse> chatStatus(String leagueId) async =>
      ChatStatusResponse.fromJson(await getJson('/api/leagues/$leagueId/chat'));

  Future<ChatMessagesResponse> chatMessages(String leagueId, {String? thread}) async =>
      ChatMessagesResponse.fromJson(await getJson('/api/leagues/$leagueId/chat/messages',
          query: thread != null ? {'thread': thread} : null));

  Future<void> sendChat(String leagueId, String ciphertext, int epoch,
          {String? matchId,
          String? threadId,
          List<String>? mentions,
          List<Map<String, dynamic>>? images}) async =>
      postJson('/api/leagues/$leagueId/chat/messages', body: {
        'ciphertext': ciphertext,
        'epoch': epoch,
        if (matchId != null) 'matchId': matchId,
        if (threadId != null) 'threadId': threadId,
        if (mentions != null && mentions.isNotEmpty) 'mentions': mentions,
        if (images != null && images.isNotEmpty) 'images': images,
      });

  /// Fetch one message attachment's ciphertext + epoch (decrypted client-side).
  Future<ChatAttachmentResponse> chatAttachment(
          String leagueId, String messageId, int idx) async =>
      ChatAttachmentResponse.fromJson(await getJson(
          '/api/leagues/$leagueId/chat/attachments/$messageId',
          query: {'idx': '$idx'}));

  Future<void> requestChatKey(String leagueId) async =>
      postJson('/api/leagues/$leagueId/chat/request-key');

  /// Keyholder: seal the current group key to members who are missing it.
  Future<void> sealChatKeys(String leagueId, int epoch, List<Map<String, String>> wraps) async =>
      postJson('/api/leagues/$leagueId/chat/keys', body: {'epoch': epoch, 'wraps': wraps});

  Future<void> reactChatMessage(String leagueId, String messageId, String emoji) async =>
      putJson('/api/leagues/$leagueId/chat/react',
          body: {'messageId': messageId, 'emoji': emoji});

  Future<void> editChatMessage(String leagueId, String messageId, String ciphertext) async =>
      postJson('/api/leagues/$leagueId/chat/edit',
          body: {'messageId': messageId, 'ciphertext': ciphertext});

  /// The moderation queue (owner/mod): reported messages with ciphertext + epoch.
  Future<List<Report>> chatReports(String leagueId) async =>
      ChatReportsResponse.fromJson(await getJson('/api/leagues/$leagueId/chat/reports')).reports;

  Future<void> moderateChatMessage(String leagueId, String messageId, String action) async =>
      postJson('/api/leagues/$leagueId/chat/moderate',
          body: {'messageId': messageId, 'action': action});

  Future<void> reportChatMessage(String leagueId, String messageId) async =>
      postJson('/api/leagues/$leagueId/chat/report',
          body: {'messageId': messageId, 'reported': true});

  /// The key-transparency log (verified client-side against the hash chain).
  Future<Map<String, dynamic>> keysLog() async => getJson('/api/keys/log');
}
