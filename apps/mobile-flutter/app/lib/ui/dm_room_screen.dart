import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../chat/chat_providers.dart' show ChatState;
import '../chat/dm_providers.dart';
import '../chat/outbox.dart';
import '../i18n/i18n_scope.dart';
import '../live/typing_throttle.dart';
import '../reactions.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import '../voice/voice_service.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/chat_attachment.dart';
import 'widgets/chat_composer.dart';
import 'widgets/chat_line_tile.dart';
import 'widgets/chat_message_list.dart';
import 'widgets/chat_recovery_gate.dart';
import 'widgets/empty_state.dart';
import 'widgets/kt_key_badge.dart';
import 'widgets/voice_bar.dart';

/// The id of the caller's newest own message the other participant has read
/// (createdAt <= their last-read time), for the single "Seen" marker.
String? lastSeenOwnMessage(DmRoomView view, String? selfId) {
  final readAt = view.otherReadAt;
  if (selfId == null || readAt == null) return null;
  String? seen;
  for (final l in view.lines) {
    if (l.userId != selfId) continue;
    final ts = DateTime.tryParse(l.createdAt);
    if (ts != null && !ts.isAfter(readAt)) seen = l.id;
  }
  return seen;
}

/// A 1:1 encrypted conversation. Same crypto + display as league chat.
class DmRoomScreen extends ConsumerStatefulWidget {
  const DmRoomScreen({super.key, required this.threadId, required this.title});
  final String threadId;
  final String title;

  @override
  ConsumerState<DmRoomScreen> createState() => _DmRoomScreenState();
}

class _DmRoomScreenState extends ConsumerState<DmRoomScreen> {
  final _input = TextEditingController();
  DateTime? _lastTyping;

  String get _room => 'dm:${widget.threadId}';

  VoiceScope get _scope => VoiceScope.dm(widget.threadId);

  @override
  void initState() {
    super.initState();
    // Mark the thread read on open, then refresh the inbox unread badge.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await ref.read(apiProvider).markDmRead(widget.threadId);
        if (!mounted) return;
        ref.invalidate(dmThreadsProvider);
      } catch (e) {
        if (mounted) showToast(context, apiMessage(context, e));
      }
    });
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  // The server only relays this to the other participant.
  void _notifyTyping() {
    final now = DateTime.now();
    if (!mayNotifyTyping(_lastTyping, now)) return;
    _lastTyping = now;
    ref.read(liveServiceProvider).send({'type': 'dm:typing', 'threadId': widget.threadId});
  }

  Future<void> _sendImage() async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, maxWidth: 1280, maxHeight: 1280, imageQuality: 80);
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    final caption = _input.text.trim();
    final text = caption.isEmpty ? '\u{1F5BC}' : caption;
    _input.clear();
    ref.read(chatOutboxProvider.notifier).enqueue(_room, text,
        () => ref.read(sendDmProvider)(widget.threadId, text, image: bytes));
  }

  Future<void> _react(String messageId) async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          alignment: WrapAlignment.center,
          children: [
            for (final (key, glyph) in reactionPalette)
              IconButton(
                iconSize: 30,
                tooltip: key,
                icon: Text(glyph, style: const TextStyle(fontSize: 28)),
                onPressed: () => Navigator.pop(context, key),
              ),
          ],
        ),
      ),
    );
    if (picked == null || !mounted) return;
    final ok = await runAction(
        context, () => ref.read(apiProvider).reactDm(widget.threadId, messageId, picked));
    if (ok) ref.invalidate(dmRoomProvider(widget.threadId));
  }

  Future<void> _call(String otherId) async {
    try {
      await ref.read(voiceServiceProvider).invite(_scope, [otherId]);
    } on VoiceJoinException catch (e) {
      if (!mounted) return;
      showToast(context, context.tr(e.micDenied ? 'voice.error.micDenied' : 'err.serverError'));
    } catch (e) {
      if (mounted) showToast(context, apiMessage(context, e));
    }
  }

  void _send() {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    _input.clear();
    ref.read(chatOutboxProvider.notifier).enqueue(_room, text,
        () => ref.read(sendDmProvider)(widget.threadId, text));
  }

  @override
  Widget build(BuildContext context) {
    final room = ref.watch(dmRoomProvider(widget.threadId));
    final view = room.valueOrNull;
    final otherId = view?.otherId ?? '';
    final self = ref.watch(authControllerProvider).valueOrNull?.id;
    final outbox = ref.watch(chatOutboxProvider).where((e) => e.roomId == _room).toList();
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Flexible(child: Text(widget.title, overflow: TextOverflow.ellipsis)),
            if (view != null) ...[
              const SizedBox(width: 8),
              KtKeyBadge(check: view.otherKeyCheck),
            ],
          ],
        ),
        actions: [
          if (otherId.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.call_outlined),
              tooltip: context.tr('voice.call'),
              onPressed: () => _call(otherId),
            ),
        ],
      ),
      bottomNavigationBar: VoiceBar(scope: _scope),
      body: Column(
        children: [
          Expanded(
            child: AsyncValueView<DmRoomView>(
              value: room,
              onRetry: () => ref.invalidate(dmRoomProvider(widget.threadId)),
              data: (view) {
                final seenId = lastSeenOwnMessage(view, self);
                return switch (view.state) {
                  ChatState.awaitingKey =>
                    EmptyState(message: context.tr('chat.awaitingKey'), icon: Icons.hourglass_empty),
                  ChatState.needsIdentity => const Center(child: CircularProgressIndicator()),
                  ChatState.disabled => EmptyState(
                      message: context.tr('chat.disabled'), icon: Icons.speaker_notes_off_outlined),
                  ChatState.keyMismatch => const ChatRecoveryGate(
                      messageKey: 'chat.keyMismatch',
                      icon: Icons.gpp_bad,
                      danger: true,
                      offerReset: true,
                    ),
                  ChatState.ready => ChatMessageList(
                      lines: view.lines,
                      outbox: outbox,
                      reverse: true,
                      emptyMessage: context.tr('chat.empty'),
                      tile: (line) => ChatLineTile(
                        line: line,
                        own: line.userId != null && line.userId == self,
                        undecryptableLabel: context.tr('chat.undecryptable'),
                        attachmentBuilder: (i) => ChatAttachment(
                          provider: dmAttachmentProvider((widget.threadId, line.id, i)),
                        ),
                        trailing: line.id == seenId
                            ? Text(context.tr('dm.seen'),
                                style: Theme.of(context)
                                    .textTheme
                                    .labelSmall
                                    ?.copyWith(color: context.tokens.muted))
                            : null,
                        onLongPress: () => _react(line.id),
                      ),
                    ),
                };
              },
            ),
          ),
          if (view?.state == ChatState.ready) ...[
            DmTypingHint(room: _room, otherId: otherId, otherName: widget.title),
            ChatComposer(
              controller: _input,
              onSend: _send,
              onChanged: (_) => _notifyTyping(),
              leading: [
                IconButton(
                  icon: const Icon(Icons.image_outlined),
                  tooltip: context.tr('chat.image.attach'),
                  onPressed: _sendImage,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// How long a `dm:typing` frame keeps the hint on screen.
const _typingWindow = Duration(seconds: 5);

/// "X is typing…" for a DM thread, off the hub's `dm:typing` frames. The league
/// equivalent (TypingIndicator) resolves names from the league roster; a DM has
/// exactly one other participant, whose name is the room title.
class DmTypingHint extends ConsumerStatefulWidget {
  const DmTypingHint({super.key, required this.room, required this.otherId, required this.otherName});

  /// The typing-map room key (`dm:<threadId>`).
  final String room;
  final String otherId;
  final String otherName;

  @override
  ConsumerState<DmTypingHint> createState() => _DmTypingHintState();
}

class _DmTypingHintState extends ConsumerState<DmTypingHint> {
  Timer? _expiry;

  @override
  void dispose() {
    _expiry?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final at = ref.watch(typingProvider)['${widget.room}|${widget.otherId}'];
    final now = DateTime.now();
    if (at == null || now.difference(at) >= _typingWindow) return const SizedBox.shrink();
    // Nothing else rebuilds when the entry merely goes stale, so re-render at
    // its expiry or the hint would stick until the next unrelated frame.
    _expiry?.cancel();
    _expiry = Timer(at.add(_typingWindow).difference(now), () {
      if (mounted) setState(() {});
    });
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Padding(
        padding: const EdgeInsetsDirectional.only(start: 16, bottom: 4),
        child: Text(
          context.tr('chat.typing.one', {'name': widget.otherName}),
          style: Theme.of(context).textTheme.labelSmall?.copyWith(color: context.tokens.muted),
        ),
      ),
    );
  }
}
