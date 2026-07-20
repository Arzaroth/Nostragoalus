import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../api/models.gen.dart';
import '../chat/chat_providers.dart';
import '../chat/outbox.dart';
import '../i18n/i18n_scope.dart';
import '../reactions.dart';
import '../state/providers.dart';
import 'feedback.dart';
import 'thread_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/chat_attachment.dart';
import 'widgets/chat_composer.dart';
import 'widgets/chat_line_tile.dart';
import 'widgets/chat_message_list.dart';
import 'widgets/chat_recovery_gate.dart';
import 'widgets/typing_indicator.dart';

/// The league members named with a literal `@Name` in [text]. Derived at send
/// time so an edited-away or image-interrupted mention cannot ride along on a
/// later message.
List<String> mentionIdsIn(String text, List<Member> members) => [
      for (final m in members)
        if (m.name.isNotEmpty && text.contains('@${m.name}')) m.userId,
    ];

/// End-to-end-encrypted league chat. The identity bootstraps automatically on a
/// device that has never chatted; a fresh device with an escrowed identity is
/// gated on the recovery code.
class LeagueChatScreen extends ConsumerWidget {
  const LeagueChatScreen({super.key, required this.leagueId, required this.name});
  final String leagueId;
  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final identity = ref.watch(chatIdentityProvider);
    return Scaffold(
      appBar: AppBar(title: Text(name)),
      body: identity.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(child: Text(context.tr('err.generic'))),
        data: (state) => state.needsRecovery
            ? const ChatRecoveryGate()
            : _ChatBody(leagueId: leagueId),
      ),
    );
  }
}

class _ChatBody extends ConsumerStatefulWidget {
  const _ChatBody({required this.leagueId});
  final String leagueId;
  @override
  ConsumerState<_ChatBody> createState() => _ChatBodyState();
}

class _ChatBodyState extends ConsumerState<_ChatBody> {
  final _input = TextEditingController();
  DateTime? _lastTyping;

  String get _room => 'league:${widget.leagueId}';

  List<Member> get _members =>
      ref.read(leagueDetailProvider(widget.leagueId)).valueOrNull?.members ?? const <Member>[];

  // Throttle chat:typing to at most one frame every 2s while composing.
  void _notifyTyping() {
    final now = DateTime.now();
    if (_lastTyping != null && now.difference(_lastTyping!).inSeconds < 2) return;
    _lastTyping = now;
    ref.read(liveServiceProvider).send({'type': 'chat:typing', 'leagueId': widget.leagueId});
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  // Optimistic send: the text shows immediately in the outbox ("Sending…"), then
  // either lands as the real message or stays as "Not sent" with Retry/Discard.
  void _send() {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    final mentions = mentionIdsIn(text, _members);
    _input.clear();
    ref.read(chatOutboxProvider.notifier).enqueue(_room, text,
        () => ref.read(sendChatProvider)(widget.leagueId, text, mentions: mentions));
  }

  Future<void> _sendImage() async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, maxWidth: 1280, maxHeight: 1280, imageQuality: 80);
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    final caption = _input.text.trim();
    final text = caption.isEmpty ? '\u{1F5BC}' : caption;
    final mentions = mentionIdsIn(caption, _members);
    _input.clear();
    ref.read(chatOutboxProvider.notifier).enqueue(
        _room,
        text,
        () => ref.read(sendChatProvider)(widget.leagueId, text,
            image: bytes, mentions: mentions));
  }

  Future<void> _pickMention() async {
    final members = _members;
    if (members.isEmpty) return;
    final picked = await showModalBottomSheet<Member>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final m in members)
              ListTile(
                leading: CircleAvatar(child: Text(m.name.characters.first.toUpperCase())),
                title: Text(m.name),
                onTap: () => Navigator.pop(context, m),
              ),
          ],
        ),
      ),
    );
    if (picked == null) return;
    final t = _input.text;
    _input.text = t.isEmpty || t.endsWith(' ') ? '$t@${picked.name} ' : '$t @${picked.name} ';
    _input.selection = TextSelection.collapsed(offset: _input.text.length);
  }

  Future<void> _messageActions(ChatLine line) async {
    final selfId = ref.read(authControllerProvider).valueOrNull?.id;
    final isOwn = line.userId != null && line.userId == selfId;
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Wrap(
              alignment: WrapAlignment.center,
              children: [
                for (final (key, glyph) in reactionPalette)
                  IconButton(
                    iconSize: 30,
                    tooltip: key,
                    icon: Text(glyph, style: const TextStyle(fontSize: 28)),
                    onPressed: () => Navigator.pop(context, 'react:$key'),
                  ),
              ],
            ),
            if (isOwn && line.text != null)
              ListTile(
                leading: const Icon(Icons.edit),
                title: Text(context.tr('chat.edit.button')),
                onTap: () => Navigator.pop(context, 'edit'),
              ),
            ListTile(
              leading: const Icon(Icons.flag_outlined),
              title: Text(context.tr('chat.report')),
              onTap: () => Navigator.pop(context, 'report'),
            ),
          ],
        ),
      ),
    );
    if (action == null || !mounted) return;
    final api = ref.read(apiProvider);
    if (action == 'report') {
      await runAction(context, () => api.reportChatMessage(widget.leagueId, line.id),
          successKey: 'chat.reported');
    } else if (action == 'edit') {
      await _edit(line);
    } else if (action.startsWith('react:')) {
      // The server validates the KEY (`z.enum(REACTION_EMOJIS)`), never the glyph.
      final ok = await runAction(
          context, () => api.reactChatMessage(widget.leagueId, line.id, action.substring(6)));
      if (ok) ref.invalidate(leagueChatProvider(widget.leagueId));
    }
  }

  Future<void> _edit(ChatLine line) async {
    final controller = TextEditingController(text: line.text ?? '');
    final newText = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.tr('chat.edit.button')),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: null,
          decoration: const InputDecoration(border: OutlineInputBorder()),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context), child: Text(context.tr('common.cancel'))),
          FilledButton(
              onPressed: () => Navigator.pop(context, controller.text.trim()),
              child: Text(context.tr('common.save'))),
        ],
      ),
    );
    controller.dispose();
    if (newText == null || newText.isEmpty || newText == line.text || !mounted) return;
    // editChatProvider throws when this device holds no key for the epoch.
    await runAction(context, () => ref.read(editChatProvider)(widget.leagueId, line.id, newText));
  }

  Widget _tile(ChatLine line, List<Member> members) {
    Member? author;
    for (final m in members) {
      if (m.userId == line.userId) author = m;
    }
    return ChatLineTile(
      line: line,
      undecryptableLabel: context.tr('chat.undecryptable'),
      authorName: author?.name ?? (line.userId == null ? null : context.tr('chat.unknownUser')),
      authorImage: author?.image,
      attachmentBuilder: (i) => ChatAttachment(
        provider: chatAttachmentProvider((widget.leagueId, line.id, i)),
      ),
      footer: TextButton.icon(
        style: TextButton.styleFrom(
            padding: EdgeInsets.zero,
            minimumSize: const Size(0, 28),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap),
        icon: const Icon(Icons.forum, size: 14),
        label: Text(line.threadCount > 0
            ? context.tr('chat.thread.count', {'n': line.threadCount})
            : context.tr('chat.reply.button')),
        onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => ThreadScreen(leagueId: widget.leagueId, threadId: line.id),
        )),
      ),
      onLongPress: () => _messageActions(line),
    );
  }

  @override
  Widget build(BuildContext context) {
    final chat = ref.watch(leagueChatProvider(widget.leagueId));
    final outbox = ref.watch(chatOutboxProvider).where((e) => e.roomId == _room).toList();
    final members =
        ref.watch(leagueDetailProvider(widget.leagueId)).valueOrNull?.members ?? const <Member>[];
    final ready = chat.valueOrNull?.state == ChatState.ready;
    return Column(
      children: [
        Expanded(
          child: AsyncValueView<LeagueChatView>(
            value: chat,
            onRetry: () => ref.invalidate(leagueChatProvider(widget.leagueId)),
            data: (view) => switch (view.state) {
              ChatState.disabled => Center(child: Text(context.tr('chat.disabled'))),
              ChatState.awaitingKey => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(context.tr('chat.awaitingKey'), textAlign: TextAlign.center),
                  ),
                ),
              ChatState.needsIdentity => const Center(child: CircularProgressIndicator()),
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
                  tile: (line) => _tile(line, members),
                ),
            },
          ),
        ),
        if (ready) ...[
          TypingIndicator(leagueId: widget.leagueId),
          ChatComposer(
            controller: _input,
            onSend: _send,
            onChanged: (_) => _notifyTyping(),
            leading: [
              IconButton(
                icon: const Icon(Icons.image),
                tooltip: context.tr('chat.image.attach'),
                onPressed: _sendImage,
              ),
              IconButton(
                icon: const Icon(Icons.alternate_email),
                tooltip: context.tr('chat.mention.title'),
                onPressed: _pickMention,
              ),
            ],
          ),
        ],
      ],
    );
  }
}
