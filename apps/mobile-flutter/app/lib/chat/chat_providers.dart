import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../e2ee/e2ee.dart' as e2ee;
import '../state/providers.dart';
import 'chat_crypto.dart';

/// Resolved identity state: a usable identity, or a fresh device that needs the
/// recovery code to restore the private key the server already has escrowed.
class ChatIdentityState {
  const ChatIdentityState({this.identity, this.needsRecovery = false});
  final ChatIdentity? identity;
  final bool needsRecovery;
}

/// Bootstraps the chat identity: generates + registers one if the server has
/// none and this device is fresh; reuses the local keypair when it matches the
/// server's public key; otherwise flags that recovery is needed.
final chatIdentityProvider =
    AsyncNotifierProvider<ChatIdentityController, ChatIdentityState>(ChatIdentityController.new);

class ChatIdentityController extends AsyncNotifier<ChatIdentityState> {
  @override
  Future<ChatIdentityState> build() async {
    final sodium = await ref.watch(sodiumProvider.future);
    final api = ref.watch(apiProvider);
    final store = ref.watch(chatKeyStoreProvider);

    final server = await api.chatIdentity();
    final local = await store.load();

    if (server.identity == null) {
      final gen = e2ee.generateIdentity(sodium);
      final id = ChatIdentity(gen.publicKey, gen.privateKey);
      await api.registerIdentity(id.publicKey);
      await store.save(id);
      return ChatIdentityState(identity: id);
    }
    if (local != null && local.publicKey == server.identity!.publicKey) {
      return ChatIdentityState(identity: local);
    }
    return const ChatIdentityState(needsRecovery: true);
  }

  /// Restore the private key on a fresh device from the recovery code.
  Future<void> recover(String code) async {
    final sodium = await ref.read(sodiumProvider.future);
    final api = ref.read(apiProvider);
    final server = await api.chatIdentity();
    final blob = await api.chatRecoveryBlob();
    if (server.identity == null || blob == null) {
      throw StateError('no escrowed identity to recover');
    }
    final priv = e2ee.unwrapPrivateKeyWithRecovery(sodium, blob, code);
    final id = ChatIdentity(server.identity!.publicKey, priv);
    await ref.read(chatKeyStoreProvider).save(id);
    state = AsyncData(ChatIdentityState(identity: id));
  }

  /// Hard reset: generate a fresh keypair, tell the server to revoke the old
  /// identity + sealed keys, and replace the local key. History sealed to the old
  /// identity becomes permanently unreadable; the user re-joins each chat afresh.
  Future<void> reset() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final sodium = await ref.read(sodiumProvider.future);
      final api = ref.read(apiProvider);
      final gen = e2ee.generateIdentity(sodium);
      final id = ChatIdentity(gen.publicKey, gen.privateKey);
      await api.resetChatIdentity(id.publicKey);
      await ref.read(chatKeyStoreProvider).save(id);
      return ChatIdentityState(identity: id);
    });
  }

  /// Escrow the private key under a recovery code so another device can restore it.
  Future<void> setupRecovery(String code) async {
    final sodium = await ref.read(sodiumProvider.future);
    final id = state.value?.identity;
    if (id == null) return;
    final blob = e2ee.wrapPrivateKeyWithRecovery(sodium, id.privateKey, code);
    await ref.read(apiProvider).setChatRecovery(blob);
  }

  /// Generate a fresh recovery code, escrow the private key under it, and return
  /// it to show the user once.
  Future<String> createRecoveryCode() async {
    final sodium = await ref.read(sodiumProvider.future);
    final code = e2ee.generateRecoveryCode(sodium);
    await setupRecovery(code);
    return code;
  }
}

/// One decrypted (or undecryptable) line of chat.
class ChatLine {
  const ChatLine(
      {required this.id,
      required this.userId,
      required this.text,
      required this.createdAt,
      this.attachmentCount = 0,
      this.threadCount = 0});
  final String id;
  final String? userId;
  final String? text; // null when this epoch's key is unavailable
  final String createdAt;
  final int attachmentCount;
  final int threadCount;
}

/// A league's chat, decrypted for display. `state` distinguishes the reasons a
/// user might not see messages yet.
enum ChatState { ready, needsIdentity, awaitingKey, disabled }

class LeagueChatView {
  const LeagueChatView({
    required this.state,
    this.epoch = 0,
    this.lines = const [],
    this.key,
  });
  final ChatState state;
  final int epoch;
  final List<ChatLine> lines;
  final Uint8List? key; // current epoch's group key, for sending
}

final leagueChatProvider =
    FutureProvider.family<LeagueChatView, String>((ref, leagueId) async {
  final sodium = await ref.watch(sodiumProvider.future);
  final api = ref.watch(apiProvider);
  final identity = (await ref.watch(chatIdentityProvider.future)).identity;
  if (identity == null) return const LeagueChatView(state: ChatState.needsIdentity);

  final status = await api.chatStatus(leagueId);
  if (!status.enabled) return const LeagueChatView(state: ChatState.disabled);

  final keys = <int, Uint8List>{};
  for (final wk in status.myWrappedKeys) {
    try {
      keys[wk.epoch.toInt()] = e2ee.openGroupKey(sodium, wk.wrappedKey, identity.asMap);
    } catch (_) {/* an epoch we can't open; others may still work */}
  }
  final epoch = status.epoch.toInt();
  if (keys[epoch] == null) {
    await api.requestChatKey(leagueId).catchError((_) {});
    return LeagueChatView(state: ChatState.awaitingKey, epoch: epoch);
  }

  final msgs = await api.chatMessages(leagueId);
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
        attachmentCount: m.attachments.length,
        threadCount: m.threadCount.toInt()));
  }
  return LeagueChatView(state: ChatState.ready, epoch: epoch, lines: lines, key: keys[epoch]);
});

/// Decrypted messages inside one thread ((leagueId, threadRootId)). Reuses the
/// caller's per-epoch keys; used by the thread view.
final leagueThreadProvider =
    FutureProvider.family<List<ChatLine>, (String, String)>((ref, args) async {
  final (leagueId, threadId) = args;
  final sodium = await ref.watch(sodiumProvider.future);
  final identity = (await ref.watch(chatIdentityProvider.future)).identity;
  if (identity == null) return const [];
  final status = await ref.watch(apiProvider).chatStatus(leagueId);
  final keys = <int, Uint8List>{};
  for (final wk in status.myWrappedKeys) {
    try {
      keys[wk.epoch.toInt()] = e2ee.openGroupKey(sodium, wk.wrappedKey, identity.asMap);
    } catch (_) {/* skip */}
  }
  final msgs = await ref.watch(apiProvider).chatMessages(leagueId, thread: threadId);
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
  return lines;
});

/// Encrypt + send a message to the league (optional @-mentions, image, or thread
/// id), then refresh. The image bytes are encrypted under the same group key.
final sendChatProvider = Provider<
    Future<void> Function(String, String,
        {List<String> mentions, Uint8List? image, String? threadId})>((ref) {
  return (leagueId, text,
      {List<String> mentions = const [], Uint8List? image, String? threadId}) async {
    final sodium = await ref.read(sodiumProvider.future);
    final view = ref.read(leagueChatProvider(leagueId)).valueOrNull;
    if (view == null || view.key == null) return;
    final ct = e2ee.encryptMessage(sodium, text, view.key!);
    final images = image == null
        ? null
        : [
            {
              'ciphertext': e2ee.encryptBytes(sodium, image, view.key!),
              'byteSize': image.length,
            }
          ];
    await ref.read(apiProvider).sendChat(leagueId, ct, view.epoch,
        mentions: mentions, images: images, threadId: threadId);
    if (threadId != null) ref.invalidate(leagueThreadProvider((leagueId, threadId)));
    ref.invalidate(leagueChatProvider(leagueId));
  };
});

/// Fetch + decrypt one message image attachment (by (leagueId, messageId, idx)).
final chatAttachmentProvider =
    FutureProvider.family<Uint8List?, (String, String, int)>((ref, args) async {
  final (leagueId, messageId, idx) = args;
  final sodium = await ref.watch(sodiumProvider.future);
  final identity = (await ref.watch(chatIdentityProvider.future)).identity;
  if (identity == null) return null;
  final status = await ref.watch(apiProvider).chatStatus(leagueId);
  final keys = <int, Uint8List>{};
  for (final wk in status.myWrappedKeys) {
    try {
      keys[wk.epoch.toInt()] = e2ee.openGroupKey(sodium, wk.wrappedKey, identity.asMap);
    } catch (_) {/* skip */}
  }
  final att = await ref.watch(apiProvider).chatAttachment(leagueId, messageId, idx);
  final key = keys[(att['epoch'] as num?)?.toInt() ?? -1];
  if (key == null) return null;
  try {
    return e2ee.decryptBytes(sodium, att['ciphertext'].toString(), key);
  } catch (_) {
    return null;
  }
});

/// One reported message, decrypted for the moderator.
class ModerationReport {
  const ModerationReport({
    required this.messageId,
    required this.text,
    required this.reports,
    required this.moderation,
    required this.createdAt,
  });
  final String messageId;
  final String? text; // null when the key for its epoch is unavailable
  final int reports;
  final String moderation; // VISIBLE / PENDING / REMOVED
  final String createdAt;
}

/// The decrypted moderation queue for a league (owner/moderators only). Reuses
/// the per-epoch keys the caller holds to read each reported message; the server
/// only ever sees ciphertext.
final moderationReportsProvider =
    FutureProvider.family<List<ModerationReport>, String>((ref, leagueId) async {
  final sodium = await ref.watch(sodiumProvider.future);
  final api = ref.watch(apiProvider);
  final identity = (await ref.watch(chatIdentityProvider.future)).identity;
  if (identity == null) return const [];

  final status = await api.chatStatus(leagueId);
  final keys = <int, Uint8List>{};
  for (final wk in status.myWrappedKeys) {
    try {
      keys[wk.epoch.toInt()] = e2ee.openGroupKey(sodium, wk.wrappedKey, identity.asMap);
    } catch (_) {/* skip epochs we cannot open */}
  }

  final reports = await api.chatReports(leagueId);
  final out = <ModerationReport>[];
  for (final raw in reports) {
    final r = (raw as Map).cast<String, dynamic>();
    final epoch = (r['epoch'] as num?)?.toInt() ?? 0;
    final k = keys[epoch];
    String? text;
    if (k != null) {
      try {
        text = e2ee.decryptMessage(sodium, r['ciphertext'].toString(), k);
      } catch (_) {/* corrupt / wrong key */}
    }
    out.add(ModerationReport(
      messageId: r['id'].toString(),
      text: text,
      reports: (r['reports'] as num?)?.toInt() ?? 0,
      moderation: (r['moderation'] ?? 'VISIBLE').toString(),
      createdAt: (r['createdAt'] ?? '').toString(),
    ));
  }
  return out;
});

/// Re-encrypt + edit an existing own message under the current epoch key.
final editChatProvider = Provider<Future<void> Function(String, String, String)>((ref) {
  return (leagueId, messageId, text) async {
    final sodium = await ref.read(sodiumProvider.future);
    final view = ref.read(leagueChatProvider(leagueId)).valueOrNull;
    if (view == null || view.key == null) return;
    final ct = e2ee.encryptMessage(sodium, text, view.key!);
    await ref.read(apiProvider).editChatMessage(leagueId, messageId, ct);
    ref.invalidate(leagueChatProvider(leagueId));
  };
});
