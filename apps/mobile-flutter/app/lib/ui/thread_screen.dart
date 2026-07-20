import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../chat/chat_providers.dart';
import '../chat/outbox.dart';
import '../i18n/i18n_scope.dart';
import 'widgets/async_value_view.dart';
import 'widgets/chat_attachment.dart';
import 'widgets/outbox_tile.dart';

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
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('chat.thread.reply'))),
      body: Column(
        children: [
          Expanded(
            child: AsyncValueView<List<ChatLine>>(
              value: thread,
              onRetry: () =>
                  ref.invalidate(leagueThreadProvider((widget.leagueId, widget.threadId))),
              data: (lines) => Builder(builder: (context) {
                final outbox =
                    ref.watch(chatOutboxProvider).where((e) => e.roomId == _room).toList();
                if (lines.isEmpty && outbox.isEmpty) {
                  return Center(child: Text(context.tr('chat.empty')));
                }
                return ListView.builder(
                  itemCount: lines.length + outbox.length,
                  itemBuilder: (context, i) {
                    if (i >= lines.length) {
                      return OutboxTile(entry: outbox[i - lines.length]);
                    }
                    final line = lines[i];
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
                            ],
                          ),
                          subtitle: Text(line.createdAt),
                        );
                      },
                    );
                  }),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      onSubmitted: (_) => _send(),
                      decoration: InputDecoration(
                        hintText: context.tr('chat.thread.placeholder'),
                        border: const OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.send),
                    onPressed: _send,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
