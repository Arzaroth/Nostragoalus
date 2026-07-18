import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../chat/chat_providers.dart' show ChatState;
import '../chat/dm_providers.dart';
import '../i18n/i18n_scope.dart';
import 'widgets/async_value_view.dart';

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
      await ref.read(sendDmProvider)(widget.threadId, text);
      _input.clear();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final room = ref.watch(dmRoomProvider(widget.threadId));
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Column(
        children: [
          Expanded(
            child: AsyncValueView<DmRoomView>(
              value: room,
              onRetry: () => ref.invalidate(dmRoomProvider(widget.threadId)),
              data: (view) => switch (view.state) {
                ChatState.awaitingKey =>
                  Center(child: Text(context.tr('chat.awaitingKey'), textAlign: TextAlign.center)),
                ChatState.needsIdentity => const Center(child: CircularProgressIndicator()),
                ChatState.disabled => Center(child: Text(context.tr('chat.disabled'))),
                ChatState.ready => view.lines.isEmpty
                    ? Center(child: Text(context.tr('chat.empty')))
                    : ListView.builder(
                        reverse: true,
                        itemCount: view.lines.length,
                        itemBuilder: (context, i) {
                          final line = view.lines[view.lines.length - 1 - i];
                          return ListTile(
                            dense: true,
                            title: Text(line.text ?? context.tr('chat.undecryptable'),
                                style: line.text == null
                                    ? const TextStyle(fontStyle: FontStyle.italic)
                                    : null),
                            subtitle: Text(line.createdAt),
                          );
                        },
                      ),
              },
            ),
          ),
          if (room.valueOrNull?.state == ChatState.ready)
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
      ),
    );
  }
}
