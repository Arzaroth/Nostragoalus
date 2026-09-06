import 'package:flutter/material.dart';

import '../../api/models.gen.dart' show MineValue, Total;
import '../../chat/chat_providers.dart' show ChatLine;
import '../../reactions.dart';
import '../../theme/app_theme.dart';
import 'panel.dart';

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

/// The chat avatar: the picture when there is one, else a condensed initial on
/// the primary container. Shared by message rows, the DM inbox and the pickers.
class ChatAvatar extends StatelessWidget {
  const ChatAvatar({super.key, required this.name, this.image, this.radius = 16});
  final String name;
  final String? image;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final url = image;
    return CircleAvatar(
      radius: radius,
      backgroundColor: scheme.primaryContainer,
      foregroundImage: url == null ? null : NetworkImage(url),
      // A broken avatar URL must degrade to the initial, not throw.
      onForegroundImageError: url == null ? null : (_, __) {},
      child: Text(
        name.isEmpty ? '?' : name.characters.first.toUpperCase(),
        style: TextStyle(
          fontFamily: AppTheme.displayFamily,
          fontSize: radius,
          fontWeight: FontWeight.w600,
          color: scheme.onPrimaryContainer,
        ),
      ),
    );
  }
}

/// One delivered chat message as a bubble: author, body (or the undecryptable
/// placeholder), its attachments, the reaction chips, an optional footer (the
/// thread button) and trailing slot (the DM "Seen" marker). Own messages sit at
/// the end on the primary container, everyone else's at the start on the raised
/// surface. Shared by league chat, threads and DMs.
class ChatLineTile extends StatelessWidget {
  const ChatLineTile({
    super.key,
    required this.line,
    required this.undecryptableLabel,
    this.own = false,
    this.authorName,
    this.authorImage,
    this.attachmentBuilder,
    this.footer,
    this.trailing,
    this.onLongPress,
  });

  final ChatLine line;
  final String undecryptableLabel;
  final bool own;
  final String? authorName;
  final String? authorImage;
  final Widget Function(int index)? attachmentBuilder;
  final Widget? footer;
  final Widget? trailing;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final t = context.tokens;
    final name = authorName;
    final radius = BorderRadiusDirectional.only(
      topStart: const Radius.circular(16),
      topEnd: const Radius.circular(16),
      bottomStart: Radius.circular(own ? 16 : 4),
      bottomEnd: Radius.circular(own ? 4 : 16),
    );
    final bubble = Material(
      color: own ? scheme.primaryContainer : t.raised,
      borderRadius: radius,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onLongPress: onLongPress,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (name != null) ...[
                Text(name,
                    style: theme.textTheme.titleSmall
                        ?.copyWith(color: own ? scheme.onPrimaryContainer : scheme.primary)),
                const SizedBox(height: 2),
              ],
              Text(
                line.text ?? undecryptableLabel,
                style: line.text == null
                    ? theme.textTheme.bodyMedium?.copyWith(fontStyle: FontStyle.italic, color: t.muted)
                    : theme.textTheme.bodyMedium,
              ),
              if (attachmentBuilder != null)
                for (var i = 0; i < line.attachmentCount; i++)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: attachmentBuilder!(i),
                  ),
              _ReactionChips(totals: line.reactions, mine: line.myReaction),
              const SizedBox(height: 4),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (footer != null) ...[footer!, const SizedBox(width: 8)],
                  Text(formatChatTime(context, line.createdAt),
                      style: theme.textTheme.labelSmall?.copyWith(color: t.muted)),
                  if (trailing != null) ...[const SizedBox(width: 8), trailing!],
                ],
              ),
            ],
          ),
        ),
      ),
    );
    final maxWidth = MediaQuery.sizeOf(context).width * 0.78;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        mainAxisAlignment: own ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!own && name != null) ...[
            ChatAvatar(name: name, image: authorImage),
            const SizedBox(width: 8),
          ],
          ConstrainedBox(constraints: BoxConstraints(maxWidth: maxWidth), child: bubble),
        ],
      ),
    );
  }
}

/// The reaction totals a message carries, as one stadium chip per non-zero
/// emoji on a hairline. The caller's own reaction is outlined in primary.
/// Renders nothing when nobody reacted.
class _ReactionChips extends StatelessWidget {
  const _ReactionChips({required this.totals, required this.mine});
  final Total? totals;
  final MineValue? mine;

  @override
  Widget build(BuildContext context) {
    final t = totals;
    if (t == null) return const SizedBox.shrink();
    final counts = <String, int>{
      'FIRE': t.fire.toInt(),
      'GOAL': t.goal.toInt(),
      'WOW': t.wow.toInt(),
      'LAUGH': t.laugh.toInt(),
      'SAD': t.sad.toInt(),
      'ANGRY': t.angry.toInt(),
    };
    final shown = [
      for (final (key, glyph) in reactionPalette)
        if ((counts[key] ?? 0) > 0) (key, glyph, counts[key]!),
    ];
    if (shown.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final tokens = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: Hairline()),
        Wrap(
          spacing: 4,
          runSpacing: 4,
          children: [
            for (final (key, glyph, count) in shown)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: ShapeDecoration(
                  color: mine?.wire == key ? scheme.primary.withValues(alpha: 0.14) : null,
                  shape: StadiumBorder(
                    side: BorderSide(color: mine?.wire == key ? scheme.primary : tokens.ruleStrong),
                  ),
                ),
                child: Text('$glyph $count', style: theme.textTheme.labelSmall?.copyWith(color: scheme.onSurface)),
              ),
          ],
        ),
      ],
    );
  }
}
