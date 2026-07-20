import 'package:flutter/material.dart';

import '../../chat/chat_providers.dart' show ChatLine;

/// A stored ISO timestamp as local wall-clock time, with the short date once the
/// message is no longer from today. Falls back to the raw string if unparsable.
String formatChatTime(BuildContext context, String iso) {
  final ts = DateTime.tryParse(iso)?.toLocal();
  if (ts == null) return iso;
  final l10n = MaterialLocalizations.of(context);
  final time = l10n.formatTimeOfDay(
    TimeOfDay.fromDateTime(ts),
    alwaysUse24HourFormat: MediaQuery.of(context).alwaysUse24HourFormat,
  );
  final now = DateTime.now();
  final today = now.year == ts.year && now.month == ts.month && now.day == ts.day;
  return today ? time : '${l10n.formatShortDate(ts)} $time';
}

/// One delivered chat message: author, body (or the undecryptable placeholder),
/// its attachments, an optional footer (the thread button) and trailing slot
/// (the DM "Seen" marker). Shared by league chat, threads and DMs.
class ChatLineTile extends StatelessWidget {
  const ChatLineTile({
    super.key,
    required this.line,
    required this.undecryptableLabel,
    this.authorName,
    this.authorImage,
    this.attachmentBuilder,
    this.footer,
    this.trailing,
    this.onLongPress,
  });

  final ChatLine line;
  final String undecryptableLabel;
  final String? authorName;
  final String? authorImage;
  final Widget Function(int index)? attachmentBuilder;
  final Widget? footer;
  final Widget? trailing;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = authorName;
    return ListTile(
      dense: true,
      leading: name == null
          ? null
          : CircleAvatar(
              radius: 16,
              foregroundImage:
                  authorImage == null ? null : NetworkImage(authorImage!),
              // A broken avatar URL must degrade to the initial, not throw.
              onForegroundImageError: authorImage == null ? null : (_, __) {},
              child: Text(name.isEmpty ? '?' : name.characters.first.toUpperCase()),
            ),
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (name != null)
            Text(name, style: theme.textTheme.labelMedium),
          Text(
            line.text ?? undecryptableLabel,
            style: line.text == null ? const TextStyle(fontStyle: FontStyle.italic) : null,
          ),
          if (attachmentBuilder != null)
            for (var i = 0; i < line.attachmentCount; i++)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: attachmentBuilder!(i),
              ),
          if (footer != null) footer!,
        ],
      ),
      subtitle: Text(formatChatTime(context, line.createdAt)),
      trailing: trailing,
      onLongPress: onLongPress,
    );
  }
}
