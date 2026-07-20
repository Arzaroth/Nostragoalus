import 'api_client.dart';
import 'models.gen.dart';

/// Direct messages: 1:1 threads sealed to the same identity keypair as league
/// chat, so the server moves ciphertext and public keys only.
extension DmApi on ApiClient {
  Future<DmThreadsResponse> dmThreads() async =>
      DmThreadsResponse.fromJson(await getJson('/api/dm/threads'));

  Future<DmRecipientsResponse> dmRecipients() async =>
      DmRecipientsResponse.fromJson(await getJson('/api/dm/recipients'));

  /// A user's DM public key.
  Future<String> dmPublicKey(String userId) async => DmIdentityResponse.fromJson(
          await getJson('/api/dm/identity', query: {'userId': userId}))
      .identity
      .publicKey;

  Future<String> createDmThread(String recipientId, List<Map<String, String>> wraps) async =>
      DmThreadCreatedResponse.fromJson(
              await postJson('/api/dm/threads', body: {'recipientId': recipientId, 'wraps': wraps}))
          .threadId;

  Future<DmThreadResponse> dmThread(String threadId) async =>
      DmThreadResponse.fromJson(await getJson('/api/dm/$threadId'));

  // DmMessagesResponse is a typedef onto ChatMessagesResponse (identical shape).
  Future<DmMessagesResponse> dmMessages(String threadId) async =>
      DmMessagesResponse.fromJson(await getJson('/api/dm/$threadId/messages'));

  Future<void> sendDm(String threadId, String ciphertext, int epoch,
          {List<Map<String, dynamic>>? images}) async =>
      postJson('/api/dm/$threadId/messages', body: {
        'ciphertext': ciphertext,
        'epoch': epoch,
        if (images != null && images.isNotEmpty) 'images': images,
      });

  /// Fetch one DM message attachment's ciphertext + epoch (decrypted client-side).
  Future<DmAttachmentResponse> dmAttachment(String threadId, String messageId, int idx) async =>
      DmAttachmentResponse.fromJson(
          await getJson('/api/dm/$threadId/attachments/$messageId', query: {'idx': '$idx'}));

  /// Set (or clear, with null) the caller's reaction on a DM message. `emoji` is
  /// a REACTION_EMOJIS code (FIRE/GOAL/WOW/LAUGH/SAD/ANGRY).
  Future<void> reactDm(String threadId, String messageId, String? emoji) async =>
      putJson('/api/dm/$threadId/react', body: {'messageId': messageId, 'emoji': emoji});

  /// Mark the whole thread read for the caller.
  Future<void> markDmRead(String threadId) async => postJson('/api/dm/$threadId/read');
}
