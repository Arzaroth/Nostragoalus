import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../api/models.gen.dart';
import '../chat/chat_providers.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'thread_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/chat_attachment.dart';

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
            ? _RecoveryGate(leagueId: leagueId)
            : _ChatBody(leagueId: leagueId),
      ),
    );
  }
}

class _RecoveryGate extends ConsumerStatefulWidget {
  const _RecoveryGate({required this.leagueId});
  final String leagueId;
  @override
  ConsumerState<_RecoveryGate> createState() => _RecoveryGateState();
}

class _RecoveryGateState extends ConsumerState<_RecoveryGate> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _recover() async {
    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(chatIdentityProvider.notifier).recover(_code.text.trim());
    } catch (_) {
      setState(() => _error = context.tr('chat.recoverFailed'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock, size: 40),
              const SizedBox(height: 12),
              Text(context.tr('chat.recoveryNeeded'), textAlign: TextAlign.center),
              const SizedBox(height: 16),
              TextField(
                controller: _code,
                decoration: InputDecoration(
                  labelText: context.tr('chat.recoveryCode'),
                  border: const OutlineInputBorder(),
                  errorText: _error,
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ? null : _recover,
                child: Text(context.tr('chat.recover')),
              ),
            ],
          ),
        ),
      );
}

class _ChatBody extends ConsumerStatefulWidget {
  const _ChatBody({required this.leagueId});
  final String leagueId;
  @override
  ConsumerState<_ChatBody> createState() => _ChatBodyState();
}

class _ChatBodyState extends ConsumerState<_ChatBody> {
  final _input = TextEditingController();
  final _mentions = <String>{};
  bool _sending = false;
  DateTime? _lastTyping;

  // Throttle chat:typing to at most one frame every 2s while composing.
  void _notifyTyping() {
    final now = DateTime.now();
    if (_lastTyping != null && now.difference(_lastTyping!).inSeconds < 2) return;
    _lastTyping = now;
    ref.read(liveServiceProvider).send({'type': 'chat:typing', 'leagueId': widget.leagueId});
  }

  bool _othersTyping() {
    final self = ref.watch(authControllerProvider).valueOrNull?.id;
    final now = DateTime.now();
    return ref.watch(typingProvider).entries.any((e) {
      final parts = e.key.split('|');
      return parts.length == 2 &&
          parts[0] == widget.leagueId &&
          parts[1] != self &&
          now.difference(e.value).inSeconds < 5;
    });
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      await ref.read(sendChatProvider)(widget.leagueId, text, mentions: _mentions.toList());
      _input.clear();
      _mentions.clear();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _sendImage() async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, maxWidth: 1280, maxHeight: 1280, imageQuality: 80);
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    setState(() => _sending = true);
    try {
      final caption = _input.text.trim();
      await ref.read(sendChatProvider)(widget.leagueId, caption.isEmpty ? '\u{1F5BC}' : caption,
          image: bytes);
      _input.clear();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _pickMention() async {
    final members = ref.read(leagueDetailProvider(widget.leagueId)).valueOrNull?.members ?? const [];
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
    _mentions.add(picked.userId);
    final t = _input.text;
    _input.text = t.isEmpty || t.endsWith(' ') ? '$t@${picked.name} ' : '$t @${picked.name} ';
    _input.selection = TextSelection.collapsed(offset: _input.text.length);
  }

  Future<void> _messageActions(ChatLine line) async {
    final selfId = ref.read(authControllerProvider).valueOrNull?.id;
    final isOwn = line.userId != null && line.userId == selfId;
    const emojis = ['👍', '❤️', '😂', '🔥', '😮', '😢'];
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Wrap(
              alignment: WrapAlignment.center,
              children: [
                for (final e in emojis)
                  IconButton(
                    iconSize: 30,
                    icon: Text(e, style: const TextStyle(fontSize: 28)),
                    onPressed: () => Navigator.pop(context, 'react:$e'),
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
    if (action == null) return;
    try {
      final api = ref.read(apiProvider);
      if (action == 'report') {
        await api.reportChatMessage(widget.leagueId, line.id);
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(context.tr('chat.reported'))));
        }
      } else if (action == 'edit') {
        await _edit(line);
      } else if (action.startsWith('react:')) {
        await api.reactChatMessage(widget.leagueId, line.id, action.substring(6));
        ref.invalidate(leagueChatProvider(widget.leagueId));
      }
    } catch (_) {/* ignore */}
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
    if (newText == null || newText.isEmpty || newText == line.text) return;
    await ref.read(editChatProvider)(widget.leagueId, line.id, newText);
  }

  @override
  Widget build(BuildContext context) {
    final chat = ref.watch(leagueChatProvider(widget.leagueId));
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
              ChatState.needsIdentity =>
                const Center(child: CircularProgressIndicator()),
              ChatState.ready => view.lines.isEmpty
                  ? Center(child: Text(context.tr('chat.empty')))
                  : ListView.builder(
                      reverse: true,
                      itemCount: view.lines.length,
                      itemBuilder: (context, i) {
                        final line = view.lines[view.lines.length - 1 - i];
                        return ListTile(
                          dense: true,
                          title: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(line.text ?? context.tr('chat.undecryptable'),
                                  style: line.text == null
                                      ? const TextStyle(fontStyle: FontStyle.italic)
                                      : null),
                              for (var idx = 0; idx < line.attachmentCount; idx++)
                                Padding(
                                  padding: const EdgeInsets.only(top: 6),
                                  child: ChatAttachment(
                                      provider: chatAttachmentProvider(
                                          (widget.leagueId, line.id, idx))),
                                ),
                              TextButton.icon(
                                style: TextButton.styleFrom(
                                    padding: EdgeInsets.zero,
                                    minimumSize: const Size(0, 28),
                                    tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                                icon: const Icon(Icons.forum, size: 14),
                                label: Text(line.threadCount > 0
                                    ? context.tr('chat.thread.count').replaceAll('{n}', '${line.threadCount}')
                                    : context.tr('chat.reply.button')),
                                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                                  builder: (_) =>
                                      ThreadScreen(leagueId: widget.leagueId, threadId: line.id),
                                )),
                              ),
                            ],
                          ),
                          subtitle: Text(line.createdAt),
                          onLongPress: () => _messageActions(line),
                        );
                      },
                    ),
            },
          ),
        ),
        if (chat.valueOrNull?.state == ChatState.ready && _othersTyping())
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Padding(
              padding: const EdgeInsetsDirectional.only(start: 16, bottom: 2),
              child: Text(context.tr('chat.typingSome'),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic)),
            ),
          ),
        if (chat.valueOrNull?.state == ChatState.ready)
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.image),
                    tooltip: context.tr('chat.image'),
                    onPressed: _sending ? null : _sendImage,
                  ),
                  IconButton(
                    icon: const Icon(Icons.alternate_email),
                    tooltip: context.tr('chat.mention.title'),
                    onPressed: _pickMention,
                  ),
                  Expanded(
                    child: TextField(
                      controller: _input,
                      onChanged: (_) => _notifyTyping(),
                      onSubmitted: (_) => _send(),
                      decoration: InputDecoration(
                        hintText: context.tr('chat.compose'),
                        border: const OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: _sending
                        ? const SizedBox(
                            height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.send),
                    onPressed: _sending ? null : _send,
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
