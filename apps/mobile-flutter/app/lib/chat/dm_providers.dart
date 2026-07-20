import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sodium/sodium_sumo.dart' show SecureKey;

import '../api/models.gen.dart';
import '../e2ee/e2ee.dart' as e2ee;
import '../kt/kt_providers.dart';
import '../state/providers.dart';
import 'chat_crypto.dart';
import 'chat_providers.dart';

final dmThreadsProvider =
    FutureProvider<DmThreadsResponse>((ref) => ref.watch(apiProvider).dmThreads());

final dmRecipientsProvider =
    FutureProvider<DmRecipientsResponse>((ref) => ref.watch(apiProvider).dmRecipients());

/// A decrypted 1:1 thread (reuses the league-chat display model).
class DmRoomView {
  const DmRoomView({
    required this.state,
    this.epoch = 0,
    this.lines = const [],
    this.key,
    this.otherName = '',
    this.otherId = '',
    this.otherReadAt,
    this.otherKeyCheck = KtCheck.unknown,
  });
  final ChatState state;
  final int epoch;
  final List<ChatLine> lines;
  final SecureKey? key;
  final String otherName;
  final String otherId;
  final DateTime? otherReadAt; // when the other participant last read the thread
  final KtCheck otherKeyCheck; // how the peer's served key compares to the KT log
}

/// The thread envelope (participants, epoch, my wrapped keys), shared by the room
/// view and the attachment reads so neither refetches it.
final dmThreadDetailProvider = FutureProvider.family<DmThreadResponseThread, String>(
    (ref, threadId) async => (await ref.watch(apiProvider).dmThread(threadId)).thread);

/// My openable group keys per epoch for a DM thread, unwrapped once and cached.
final dmEpochKeysProvider =
    FutureProvider.family<Map<int, SecureKey>, String>((ref, threadId) async {
  final sodium = await ref.watch(sodiumProvider.future);
  final identity = (await ref.watch(chatIdentityProvider.future)).identity;
  if (identity == null) throw StateError('no chat identity');
  final thread = await ref.watch(dmThreadDetailProvider(threadId).future);
  final keys = openEpochKeys(sodium, identity, thread.myWrappedKeys);
  ref.onDispose(() {
    for (final k in keys.values) {
      k.dispose();
    }
  });
  return keys;
});

final dmRoomProvider = FutureProvider.family<DmRoomView, String>((ref, threadId) async {
  final sodium = await ref.watch(sodiumProvider.future);
  final api = ref.watch(apiProvider);
  final identity = (await ref.watch(chatIdentityProvider.future)).identity;
  if (identity == null) return const DmRoomView(state: ChatState.needsIdentity);

  final thread = await ref.watch(dmThreadDetailProvider(threadId).future);
  final epoch = thread.epoch.toInt();

  final Map<int, SecureKey> keys;
  try {
    keys = await ref.watch(dmEpochKeysProvider(threadId).future);
  } on ChatKeyMismatch {
    return DmRoomView(
        state: ChatState.keyMismatch, epoch: epoch, otherName: thread.other.name);
  }
  if (keys[epoch] == null) {
    return DmRoomView(state: ChatState.awaitingKey, epoch: epoch, otherName: thread.other.name);
  }

  var otherKeyCheck = KtCheck.unknown;
  try {
    final check = await ref.watch(ktCheckProvider.future);
    otherKeyCheck = check(thread.other.userId, thread.other.publicKey);
  } catch (_) {/* KT unavailable: report unknown rather than block the room */}

  final msgs = await api.dmMessages(threadId);
  final lines = <ChatLine>[];
  for (final m in msgs.messages) {
    final k = keys[m.epoch.toInt()];
    String? text;
    if (k != null) {
      try {
        text = e2ee.decryptMessage(sodium, m.ciphertext, k);
      } catch (_) {/* corrupt / wrong key */}
    }
    lines.add(ChatLine(
        id: m.id,
        userId: m.userId,
        text: text,
        createdAt: m.createdAt,
        attachmentCount: m.attachments.length));
  }
  return DmRoomView(
      state: ChatState.ready,
      epoch: epoch,
      lines: lines,
      key: keys[epoch],
      otherName: thread.other.name,
      otherId: thread.other.userId,
      otherKeyCheck: otherKeyCheck,
      otherReadAt: DateTime.tryParse(thread.otherLastReadAt ?? ''));
});

/// Start a DM: generate a group key, seal it to me + the recipient, create the
/// thread. Returns the new thread id.
final createDmProvider = Provider<Future<String> Function(String)>((ref) {
  return (recipientId) async {
    final sodium = await ref.read(sodiumProvider.future);
    final api = ref.read(apiProvider);
    final identity = (await ref.read(chatIdentityProvider.future)).identity!;
    final myId = ref.read(authControllerProvider).valueOrNull!.id;
    final recipientKey = await api.dmPublicKey(recipientId);

    // Never seal a key to a public key the transparency log contradicts, nor to
    // anyone while the log itself is proven rewritten: that is exactly the
    // substitution the log exists to catch. An unreachable log stays permissive
    // (no evidence either way) so a KT outage cannot block messaging.
    try {
      final kt = await ref.read(ktProvider.future);
      if (kt.headTampered || kt.check(recipientId, recipientKey) == KtCheck.mismatch) {
        throw const KtKeyMismatch();
      }
    } on KtKeyMismatch {
      rethrow;
    } catch (_) {/* KT unavailable */}

    final groupKey = e2ee.generateGroupKey(sodium);
    try {
      final wraps = [
        {'userId': myId, 'wrappedKey': e2ee.sealGroupKey(sodium, groupKey, identity.publicKey)},
        {'userId': recipientId, 'wrappedKey': e2ee.sealGroupKey(sodium, groupKey, recipientKey)},
      ];
      final threadId = await api.createDmThread(recipientId, wraps);
      ref.invalidate(dmThreadsProvider);
      return threadId;
    } finally {
      groupKey.dispose();
    }
  };
});

final sendDmProvider =
    Provider<Future<void> Function(String, String, {Uint8List? image})>((ref) {
  return (threadId, text, {Uint8List? image}) async {
    final sodium = await ref.read(sodiumProvider.future);
    final view = ref.read(dmRoomProvider(threadId)).valueOrNull;
    final key = view?.key;
    // Throw rather than return: a silent return drops the message the outbox
    // already removed from the composer.
    if (key == null) throw StateError('no chat key for DM thread $threadId');
    final ct = e2ee.encryptMessage(sodium, text, key);
    final images = image == null
        ? null
        : [
            {
              'ciphertext': e2ee.encryptBytes(sodium, image, key),
              'byteSize': image.length,
            }
          ];
    await ref.read(apiProvider).sendDm(threadId, ct, view!.epoch, images: images);
    ref.invalidate(dmThreadDetailProvider(threadId));
    ref.invalidate(dmRoomProvider(threadId));
  };
});

/// Fetch + decrypt one DM message image attachment ((threadId, messageId, idx)).
final dmAttachmentProvider =
    FutureProvider.family<Uint8List?, (String, String, int)>((ref, args) async {
  final (threadId, messageId, idx) = args;
  final sodium = await ref.watch(sodiumProvider.future);
  final identity = (await ref.watch(chatIdentityProvider.future)).identity;
  if (identity == null) return null;
  final keys = await ref.watch(dmEpochKeysProvider(threadId).future);
  final att = EncryptedBlob.fromJson(
      await ref.watch(apiProvider).dmAttachment(threadId, messageId, idx));
  final key = keys[att.epoch];
  if (key == null) return null;
  try {
    return e2ee.decryptBytes(sodium, att.ciphertext, key);
  } catch (_) {
    return null;
  }
});
