import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../chat/chat_providers.dart' show ChatState;
import '../chat/dm_providers.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../voice/voice_service.dart';
import 'widgets/async_value_view.dart';
import 'widgets/chat_attachment.dart';
import 'widgets/voice_bar.dart';

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
  void initState() {
    super.initState();
    // Mark the thread read on open, then refresh the inbox unread badge.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await ref.read(apiProvider).markDmRead(widget.threadId);
        ref.invalidate(dmThreadsProvider);
      } catch (_) {/* ignore */}
    });
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _sendImage() async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, maxWidth: 1280, maxHeight: 1280, imageQuality: 80);
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    setState(() => _sending = true);
    try {
      final caption = _input.text.trim();
      await ref.read(sendDmProvider)(widget.threadId, caption.isEmpty ? '\u{1F5BC}' : caption,
          image: bytes);
      _input.clear();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  /// The id of the caller's newest own message the other participant has read
  /// (createdAt <= their last-read time), for the single "Seen" marker.
  String? _lastSeenOwnMessage(DmRoomView view, String? selfId) {
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

  Future<void> _react(String messageId) async {
    // REACTION_EMOJIS codes -> display glyphs (matches the web reaction set).
    const reactions = {
      'FIRE': '🔥', 'GOAL': '⚽', 'WOW': '😮', 'LAUGH': '😂', 'SAD': '😢', 'ANGRY': '😡',
    };
    final picked = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          alignment: WrapAlignment.center,
          children: [
            for (final e in reactions.entries)
              IconButton(
                iconSize: 30,
                icon: Text(e.value, style: const TextStyle(fontSize: 28)),
                onPressed: () => Navigator.pop(context, e.key),
              ),
          ],
        ),
      ),
    );
    if (picked == null) return;
    try {
      await ref.read(apiProvider).reactDm(widget.threadId, messageId, picked);
      ref.invalidate(dmRoomProvider(widget.threadId));
    } catch (_) {/* ignore */}
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
    final otherId = room.valueOrNull?.otherId ?? '';
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          if (otherId.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.call),
              tooltip: context.tr('voice.call'),
              onPressed: () => ref
                  .read(voiceServiceProvider)
                  .invite(VoiceScope(kind: 'dm', threadId: widget.threadId), [otherId]),
            ),
        ],
      ),
      bottomNavigationBar:
          VoiceBar(scope: VoiceScope(kind: 'dm', threadId: widget.threadId)),
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
                    : Builder(builder: (context) {
                        final self = ref.watch(authControllerProvider).valueOrNull?.id;
                        final seenId = _lastSeenOwnMessage(view, self);
                        return ListView.builder(
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
                                          provider: dmAttachmentProvider(
                                              (widget.threadId, line.id, idx))),
                                    ),
                                ],
                              ),
                              subtitle: Text(line.createdAt),
                              trailing: line.id == seenId
                                  ? Text(context.tr('dm.seen'),
                                      style: Theme.of(context).textTheme.bodySmall)
                                  : null,
                              onLongPress: () => _react(line.id),
                            );
                          },
                        );
                      }),
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
                    IconButton(
                      icon: const Icon(Icons.image),
                      tooltip: context.tr('chat.image'),
                      onPressed: _sending ? null : _sendImage,
                    ),
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
