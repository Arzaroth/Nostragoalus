import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sodium/sodium_sumo.dart' show SecureKey, SodiumSumo;

import '../api/models.gen.dart';
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
    final userId = (await ref.watch(authControllerProvider.future))?.id;
    if (userId == null) return const ChatIdentityState();

    final server = await api.chatIdentity();
    final local = await store.load(sodium, userId);

    if (server.identity == null) {
      // Reuse an existing device key: a server that transiently reports no
      // identity must not cost us the private key every sealed group key needs.
      final id = local ??
          () {
            final gen = e2ee.generateIdentity(sodium);
            return ChatIdentity(gen.publicKey, gen.privateKey);
          }();
      await store.save(userId, id);
      await api.registerIdentity(id.publicKey);
      return ChatIdentityState(identity: id);
    }
    if (local != null && local.publicKey == server.identity!.publicKey) {
      return ChatIdentityState(identity: local);
    }
    return const ChatIdentityState(needsRecovery: true);
  }

  String _requireUserId() {
    final userId = ref.read(authControllerProvider).valueOrNull?.id;
    if (userId == null) throw StateError('signed out');
    return userId;
  }

  /// Restore the private key on a fresh device from the recovery code.
  Future<void> recover(String code) async {
    final sodium = await ref.read(sodiumProvider.future);
    final api = ref.read(apiProvider);
    final userId = _requireUserId();
    final server = await api.chatIdentity();
    final blob = await api.chatRecoveryBlob();
    if (server.identity == null || blob == null) {
      throw StateError('no escrowed identity to recover');
    }
    final priv = e2ee.unwrapPrivateKeyWithRecovery(sodium, blob, code);
    // An escrow can predate an identity reset done elsewhere: it would decrypt
    // fine yet hold the OLD private key. Pairing it with the server's current
    // public key would leave every message undecryptable with no error at all.
    if (!e2ee.keyPairMatches(sodium, server.identity!.publicKey, priv)) {
      priv.dispose();
      throw const ChatKeyMismatch();
    }
    final id = ChatIdentity(server.identity!.publicKey, priv);
    await ref.read(chatKeyStoreProvider).save(userId, id);
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
      final userId = _requireUserId();
      final gen = e2ee.generateIdentity(sodium);
      final id = ChatIdentity(gen.publicKey, gen.privateKey);
      // Persist locally BEFORE the server call. The reset drops the old escrow
      // and every key sealed to the old identity server-side; if it landed and
      // the local write were then lost, the server would hold a public key whose
      // private key never existed - unrecoverable. Writing first means a
      // mid-flight failure leaves the old server identity and its escrow intact.
      await ref.read(chatKeyStoreProvider).save(userId, id);
      await api.resetChatIdentity(id.publicKey);
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

/// One decrypted (or undecryptable) line of chat. Author name/avatar and the
/// reaction totals are server-held METADATA riding alongside the ciphertext, so
/// a message stays attributed even once its sender left the league. The text
/// itself is still only ever readable after the local decrypt below.
class ChatLine {
  const ChatLine(
      {required this.id,
      required this.userId,
      required this.text,
      required this.createdAt,
      this.authorName,
      this.authorImage,
      this.reactions,
      this.myReaction,
      this.attachmentCount = 0,
      this.threadCount = 0});
  final String id;
  final String? userId;
  final String? text; // null when this epoch's key is unavailable
  final String createdAt;
  final String? authorName;
  final String? authorImage;
  final Total? reactions;
  final MineValue? myReaction;
  final int attachmentCount;
  final int threadCount;
}

/// A league's chat, decrypted for display. `state` distinguishes the reasons a
/// user might not see messages yet. `keyMismatch` is the alarm: the device
/// identity opens none of the keys sealed to it (a bad recovery / a reset
/// elsewhere), which must not read as an ordinary empty room.
enum ChatState { ready, needsIdentity, awaitingKey, keyMismatch, disabled }

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
  final SecureKey? key; // current epoch's group key, for sending
}

/// The league's chat status, shared by every consumer (status, keys, messages)
/// so opening a thread or an attachment does not refetch it.
final chatStatusProvider = FutureProvider.family<ChatStatusResponse, String>(
    (ref, leagueId) => ref.watch(apiProvider).chatStatus(leagueId));

/// My openable group keys per epoch for a league, unwrapped ONCE and cached for
/// as long as anything watches the league (the unwrap is a sealed-box open per
/// epoch, and every chat screen needs the same map).
final leagueEpochKeysProvider =
    FutureProvider.family<Map<int, SecureKey>, String>((ref, leagueId) async {
  final sodium = await ref.watch(sodiumProvider.future);
  final identity = (await ref.watch(chatIdentityProvider.future)).identity;
  if (identity == null) throw StateError('no chat identity');
  final status = await ref.watch(chatStatusProvider(leagueId).future);
  final keys = openEpochKeys(sodium, identity, status.myWrappedKeys);
  ref.onDispose(() {
    for (final k in keys.values) {
      k.dispose();
    }
  });
  return keys;
});

final leagueChatProvider =
    FutureProvider.family<LeagueChatView, String>((ref, leagueId) async {
  final sodium = await ref.watch(sodiumProvider.future);
  final api = ref.watch(apiProvider);
  final identity = (await ref.watch(chatIdentityProvider.future)).identity;
  if (identity == null) return const LeagueChatView(state: ChatState.needsIdentity);

  final status = await ref.watch(chatStatusProvider(leagueId).future);
  if (!status.enabled) return const LeagueChatView(state: ChatState.disabled);
  final epoch = status.epoch.toInt();

  final Map<int, SecureKey> keys;
  try {
    keys = await ref.watch(leagueEpochKeysProvider(leagueId).future);
  } on ChatKeyMismatch {
    return LeagueChatView(state: ChatState.keyMismatch, epoch: epoch);
  }
  if (keys[epoch] == null) {
    await api.requestChatKey(leagueId).catchError((_) {});
    return LeagueChatView(state: ChatState.awaitingKey, epoch: epoch);
  }

  final msgs = await api.chatMessages(leagueId);
  return LeagueChatView(
      state: ChatState.ready,
      epoch: epoch,
      lines: _decryptLines(sodium, msgs.messages, keys),
      key: keys[epoch]);
});

/// [messages] arrives NEWEST first - both chat routes document that, and page
/// backwards with `before=`. The rest of the app wants send order, so it is
/// flipped here once rather than at each render site.
List<ChatLine> _decryptLines(
    SodiumSumo sodium, List<Message> messages, Map<int, SecureKey> keys) {
  final lines = <ChatLine>[];
  for (final m in messages.reversed) {
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
        authorName: m.authorName,
        authorImage: m.authorImage,
        reactions: m.reactions,
        myReaction: m.myReaction,
        attachmentCount: m.attachments.length,
        threadCount: m.threadCount.toInt()));
  }
  return lines;
}

/// Decrypted messages inside one thread ((leagueId, threadRootId)). Reuses the
/// league's cached per-epoch keys; used by the thread view.
final leagueThreadProvider =
    FutureProvider.family<List<ChatLine>, (String, String)>((ref, args) async {
  final (leagueId, threadId) = args;
  final sodium = await ref.watch(sodiumProvider.future);
  final identity = (await ref.watch(chatIdentityProvider.future)).identity;
  if (identity == null) return const [];
  final keys = await ref.watch(leagueEpochKeysProvider(leagueId).future);
  final msgs = await ref.watch(apiProvider).chatMessages(leagueId, thread: threadId);
  return _decryptLines(sodium, msgs.messages, keys);
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
    final key = view?.key;
    // Throwing (not returning) is what keeps the typed text: the outbox only
    // drops an entry when its send completes, and renders a throw as "Not sent"
    // with Retry/Discard.
    if (key == null) throw StateError('no chat key for league $leagueId');
    final ct = e2ee.encryptMessage(sodium, text, key);
    final images = image == null
        ? null
        : [
            {
              'ciphertext': e2ee.encryptBytes(sodium, image, key),
              'byteSize': image.length,
            }
          ];
    await ref.read(apiProvider).sendChat(leagueId, ct, view!.epoch,
        mentions: mentions, images: images, threadId: threadId);
    if (threadId != null) ref.invalidate(leagueThreadProvider((leagueId, threadId)));
    ref.invalidate(chatStatusProvider(leagueId));
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
  final keys = await ref.watch(leagueEpochKeysProvider(leagueId).future);
  final att = await ref.watch(apiProvider).chatAttachment(leagueId, messageId, idx);
  final key = keys[att.epoch.toInt()];
  if (key == null) return null;
  try {
    return e2ee.decryptBytes(sodium, att.ciphertext, key);
  } catch (_) {
    return null;
  }
});

/// One reported message, decrypted for the moderator. The author is named from
/// the server's metadata, so a ruling is not made against a bare user id.
class ModerationReport {
  const ModerationReport({
    required this.messageId,
    required this.text,
    required this.reports,
    required this.moderation,
    required this.createdAt,
    this.authorName,
    this.authorImage,
  });
  final String messageId;
  final String? text; // null when the key for its epoch is unavailable
  final int reports;
  final ModerationValue moderation;
  final String createdAt;
  final String? authorName;
  final String? authorImage;
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

  final keys = await ref.watch(leagueEpochKeysProvider(leagueId).future);
  final reports = await api.chatReports(leagueId);
  final out = <ModerationReport>[];
  for (final r in reports) {
    final k = keys[r.epoch.toInt()];
    String? text;
    if (k != null) {
      try {
        text = e2ee.decryptMessage(sodium, r.ciphertext, k);
      } catch (_) {/* corrupt / wrong key */}
    }
    out.add(ModerationReport(
      messageId: r.id,
      text: text,
      reports: r.reports.toInt(),
      moderation: r.moderation,
      createdAt: r.createdAt,
      authorName: r.authorName,
      authorImage: r.authorImage,
    ));
  }
  return out;
});

/// Re-encrypt + edit an existing own message under the current epoch key.
final editChatProvider = Provider<Future<void> Function(String, String, String)>((ref) {
  return (leagueId, messageId, text) async {
    final sodium = await ref.read(sodiumProvider.future);
    final key = ref.read(leagueChatProvider(leagueId)).valueOrNull?.key;
    if (key == null) throw StateError('no chat key for league $leagueId');
    final ct = e2ee.encryptMessage(sodium, text, key);
    await ref.read(apiProvider).editChatMessage(leagueId, messageId, ct);
    ref.invalidate(leagueChatProvider(leagueId));
  };
});
