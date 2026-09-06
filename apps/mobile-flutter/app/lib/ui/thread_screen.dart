import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart' show Member;
import '../chat/chat_providers.dart';
import '../chat/outbox.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';
import 'widgets/chat_attachment.dart';
import 'widgets/chat_composer.dart';
import 'widgets/chat_line_tile.dart';
import 'widgets/chat_message_list.dart';

/// One chat thread: the messages under a root message, with a compose box that
/// posts replies into the same thread (threadId = the root message id).
class ThreadScreen extends ConsumerStatefulWidget {
  const ThreadScreen({super.key, required this.leagueId, required this.threadId});
  final String leagueId;
  final String threadId;
  @override
  ConsumerState<ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends ConsumerState<ThreadScreen> {
  final _input = TextEditingController();

  String get _room => 'thread:${widget.leagueId}:${widget.threadId}';

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  void _send() {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    _input.clear();
    ref.read(chatOutboxProvider.notifier).enqueue(_room, text,
        () => ref.read(sendChatProvider)(widget.leagueId, text, threadId: widget.threadId));
  }

  @override
  Widget build(BuildContext context) {
    final thread = ref.watch(leagueThreadProvider((widget.leagueId, widget.threadId)));
    final outbox = ref.watch(chatOutboxProvider).where((e) => e.roomId == _room).toList();
    final members =
        ref.watch(leagueDetailProvider(widget.leagueId)).valueOrNull?.members ?? const <Member>[];
    final selfId = ref.watch(authControllerProvider).valueOrNull?.id;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('chat.thread.reply'))),
      body: Column(
        children: [
          Expanded(
            child: AsyncValueView<List<ChatLine>>(
              value: thread,
              onRetry: () =>
                  ref.invalidate(leagueThreadProvider((widget.leagueId, widget.threadId))),
              data: (lines) => ChatMessageList(
                lines: lines,
                outbox: outbox,
                emptyMessage: context.tr('chat.thread.empty'),
                tile: (line) {
                  Member? author;
                  for (final m in members) {
                    if (m.userId == line.userId) author = m;
                  }
                  return ChatLineTile(
                    line: line,
                    own: line.userId != null && line.userId == selfId,
                    undecryptableLabel: context.tr('chat.undecryptable'),
                    authorName: line.authorName ??
                        author?.name ??
                        (line.userId == null ? null : context.tr('chat.unknownUser')),
                    authorImage: line.authorImage ?? author?.image,
                    attachmentBuilder: (i) => ChatAttachment(
                      provider: chatAttachmentProvider((widget.leagueId, line.id, i)),
                    ),
                  );
                },
              ),
            ),
          ),
          ChatComposer(
            controller: _input,
            onSend: _send,
            hintKey: 'chat.thread.placeholder',
          ),
        ],
      ),
    );
  }
}
