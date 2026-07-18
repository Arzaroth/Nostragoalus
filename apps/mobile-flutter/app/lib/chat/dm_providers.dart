import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../e2ee/e2ee.dart' as e2ee;
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
  });
  final ChatState state;
  final int epoch;
  final List<ChatLine> lines;
  final Uint8List? key;
  final String otherName;
}

final dmRoomProvider = FutureProvider.family<DmRoomView, String>((ref, threadId) async {
  final sodium = await ref.watch(sodiumProvider.future);
  final api = ref.watch(apiProvider);
  final identity = (await ref.watch(chatIdentityProvider.future)).identity;
  if (identity == null) return const DmRoomView(state: ChatState.needsIdentity);

  final thread = (await api.dmThread(threadId)).thread;
  final keys = <int, Uint8List>{};
  for (final wk in thread.myWrappedKeys) {
    try {
      keys[wk.epoch.toInt()] = e2ee.openGroupKey(sodium, wk.wrappedKey, identity.asMap);
    } catch (_) {/* skip an epoch we can't open */}
  }
  final epoch = thread.epoch.toInt();
  if (keys[epoch] == null) {
    return DmRoomView(state: ChatState.awaitingKey, epoch: epoch, otherName: thread.other.name);
  }

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
    lines.add(ChatLine(id: m.id, userId: m.userId, text: text, createdAt: m.createdAt));
  }
  return DmRoomView(
      state: ChatState.ready,
      epoch: epoch,
      lines: lines,
      key: keys[epoch],
      otherName: thread.other.name);
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

    final groupKey = e2ee.generateGroupKey(sodium);
    final wraps = [
      {'userId': myId, 'wrappedKey': e2ee.sealGroupKey(sodium, groupKey, identity.publicKey)},
      {'userId': recipientId, 'wrappedKey': e2ee.sealGroupKey(sodium, groupKey, recipientKey)},
    ];
    final threadId = await api.createDmThread(recipientId, wraps);
    ref.invalidate(dmThreadsProvider);
    return threadId;
  };
});

final sendDmProvider = Provider<Future<void> Function(String, String)>((ref) {
  return (threadId, text) async {
    final sodium = await ref.read(sodiumProvider.future);
    final view = ref.read(dmRoomProvider(threadId)).valueOrNull;
    if (view == null || view.key == null) return;
    final ct = e2ee.encryptMessage(sodium, text, view.key!);
    await ref.read(apiProvider).sendDm(threadId, ct, view.epoch);
    ref.invalidate(dmRoomProvider(threadId));
  };
});
