import 'package:flutter/material.dart';

import '../../chat/chat_providers.dart' show ChatLine;
import '../../chat/outbox.dart';
import 'empty_state.dart';
import 'outbox_tile.dart';

/// Delivered lines then still-pending outbox entries, in send order. [reverse]
/// flips it for a `reverse: true` ListView, whose item 0 renders at the bottom,
/// so the newest pending message stays under the delivered ones either way.
List<Object> chatItems(
  List<ChatLine> lines,
  List<OutboxEntry> outbox, {
  bool reverse = false,
}) {
  final items = <Object>[...lines, ...outbox];
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
  });

  final List<ChatLine> lines;
  final List<OutboxEntry> outbox;
  final Widget Function(ChatLine) tile;
  final String emptyMessage;
  final bool reverse;

  @override
  Widget build(BuildContext context) {
    final items = chatItems(lines, outbox, reverse: reverse);
    if (items.isEmpty) return EmptyState(message: emptyMessage);
    return ListView.builder(
      reverse: reverse,
      itemCount: items.length,
      itemBuilder: (context, i) {
        final item = items[i];
        return item is ChatLine ? tile(item) : OutboxTile(entry: item as OutboxEntry);
      },
    );
  }
}
