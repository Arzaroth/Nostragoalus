import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../chat/chat_providers.dart';
import '../i18n/i18n_scope.dart';
import 'widgets/async_value_view.dart';
import 'widgets/chat_attachment.dart';

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
  bool _sending = false;

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
      await ref.read(sendChatProvider)(widget.leagueId, text, threadId: widget.threadId);
      _input.clear();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
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
              data: (lines) => lines.isEmpty
                  ? Center(child: Text(context.tr('chat.empty')))
                  : ListView.builder(
                      itemCount: lines.length,
                      itemBuilder: (context, i) {
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
                    ),
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
      ),
    );
  }
}
