import 'package:flutter/material.dart';

import '../../api/models.gen.dart' show Call;
import '../../chat/call_log.dart';
import '../../chat/chat_providers.dart' show ChatLine;
import '../../chat/outbox.dart';
import 'call_line_tile.dart';
import 'empty_state.dart';
import 'outbox_tile.dart';

/// Delivered lines then still-pending outbox entries, in send order. [reverse]
/// flips it for a `reverse: true` ListView, whose item 0 renders at the bottom,
/// so the newest pending message stays under the delivered ones either way.
List<Object> chatItems(
  List<ChatLine> lines,
  List<OutboxEntry> outbox, {
  bool reverse = false,
  List<Call> calls = const [],
}) {
  final anchored = anchorCalls(
    calls,
    [for (final l in lines) (id: l.id, createdAt: l.createdAt)],
  );
  final items = <Object>[];
  for (final line in lines) {
    items.addAll(anchored.before[line.id] ?? const []);
    items.add(line);
  }
  // Calls newer than every message, then the sends still in flight, which are
  // newer than anything the server has confirmed.
  items..addAll(anchored.tail)..addAll(outbox);
  return reverse ? items.reversed.toList() : items;
}

/// The message list shared by league chat, threads and DMs: delivered messages
/// rendered by [tile], pending ones by [OutboxTile], one empty state for both.
class ChatMessageList extends StatelessWidget {
  const ChatMessageList({
    super.key,
    required this.lines,
    required this.outbox,
    required this.tile,
    required this.emptyMessage,
    this.reverse = false,
    this.calls = const [],
  });

  final List<ChatLine> lines;
  final List<OutboxEntry> outbox;
  final Widget Function(ChatLine) tile;
  final String emptyMessage;
  final bool reverse;

  /// The room's call log, interleaved into the timeline by start time.
  final List<Call> calls;

  @override
  Widget build(BuildContext context) {
    final items = chatItems(lines, outbox, reverse: reverse, calls: calls);
    if (items.isEmpty) return EmptyState(message: emptyMessage, icon: Icons.forum_outlined);
    return ListView.builder(
      reverse: reverse,
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: items.length,
      itemBuilder: (context, i) {
        final item = items[i];
        return switch (item) {
          ChatLine() => tile(item),
          Call() => CallLineTile(call: item),
          OutboxEntry() => OutboxTile(entry: item),
          // A fourth timeline kind (a date separator, an unread divider) would
          // otherwise reach the blind cast a wildcard leaves here and crash the
          // list mid-scroll instead of failing at the build.
          _ => const SizedBox.shrink(),
        };
      },
    );
  }
}
