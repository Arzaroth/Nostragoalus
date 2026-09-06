import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// The list surface of the design: one rounded board holding rows separated by
/// chalk hairlines. Lists are boards, not stacks of cards; a card is reserved
/// for a singular object (a pick, a league).
class Panel extends StatelessWidget {
  const Panel({
    super.key,
    required this.children,
    this.margin = const EdgeInsets.symmetric(horizontal: 16),
    this.padding,
    this.dividers = true,
    this.tint,
  });

  final List<Widget> children;
  final EdgeInsetsGeometry margin;

  /// Inner padding for free-form content. Rows manage their own padding, so a
  /// board of rows leaves this null.
  final EdgeInsetsGeometry? padding;
  final bool dividers;

  /// A wash over the board colour (the signed-in row, a warning board).
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0 && dividers) rows.add(const Hairline());
      rows.add(children[i]);
    }
    return Padding(
      padding: margin,
      child: Material(
        color: tint == null ? t.board : Color.alphaBlend(tint!, t.board),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: t.rule),
        ),
        clipBehavior: Clip.antiAlias,
        child: Padding(
          padding: padding ?? EdgeInsets.zero,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: rows),
        ),
      ),
    );
  }
}

/// A chalk hairline. Indent it to start under the row content, not the flag.
class Hairline extends StatelessWidget {
  const Hairline({super.key, this.indent = 0});
  final double indent;

  @override
  Widget build(BuildContext context) => Divider(height: 1, thickness: 1, indent: indent);
}

/// A row on a board: optional leading, a title with an optional subtitle, and a
/// trailing widget. Tappable when [onTap] is given.
class PanelRow extends StatelessWidget {
  const PanelRow({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.onTap,
    this.onLongPress,
    this.chevron = false,
    this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    this.selected = false,
  });

  final Widget title;
  final Widget? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  /// Show the "opens something" chevron at the end.
  final bool chevron;
  final EdgeInsetsGeometry padding;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final body = Padding(
      padding: padding,
      child: Row(
        children: [
          if (leading != null) ...[
            IconTheme.merge(data: IconThemeData(color: t.muted, size: 22), child: leading!),
            const SizedBox(width: 14),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                DefaultTextStyle.merge(
                  style: theme.textTheme.bodyMedium!.copyWith(fontWeight: FontWeight.w500),
                  child: title,
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  DefaultTextStyle.merge(style: theme.textTheme.bodySmall!, child: subtitle!),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: 12),
            DefaultTextStyle.merge(
              style: theme.textTheme.labelMedium!.copyWith(color: t.muted),
              child: IconTheme.merge(data: IconThemeData(color: t.muted, size: 20), child: trailing!),
            ),
          ],
          if (chevron) ...[
            const SizedBox(width: 8),
            Icon(Icons.chevron_right, size: 20, color: t.faint),
          ],
        ],
      ),
    );
    final tinted = selected
        ? ColoredBox(color: theme.colorScheme.primary.withValues(alpha: 0.08), child: body)
        : body;
    if (onTap == null && onLongPress == null) return tinted;
    return InkWell(onTap: onTap, onLongPress: onLongPress, child: tinted);
  }
}

/// The heading above a board: the condensed title, an optional count or note
/// on the far side, or an action. Sits outside the board so the board itself
/// stays a plain list surface.
class PanelHeading extends StatelessWidget {
  const PanelHeading({
    super.key,
    required this.title,
    this.trailing,
    this.action,
    this.padding = const EdgeInsets.fromLTRB(20, 20, 20, 8),
  });

  final String title;

  /// A quiet note on the far side, e.g. "8 matches".
  final String? trailing;

  /// An interactive far-side widget (a text button), used instead of [trailing].
  final Widget? action;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Text(title,
                style: theme.textTheme.headlineSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          if (action != null)
            action!
          else if (trailing != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Text(trailing!, style: theme.textTheme.labelMedium?.copyWith(color: context.tokens.muted)),
            ),
        ],
      ),
    );
  }
}

/// A small status word next to a value: "live", "you", "locked". Quiet by
/// default; [color] tints it (live red, primary for "you").
class Tag extends StatelessWidget {
  const Tag(this.label, {super.key, this.color, this.icon});
  final String label;
  final Color? color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final c = color ?? t.muted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: c),
            const SizedBox(width: 4),
          ],
          Text(label,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(color: c, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

/// The breathing red dot that marks a live match. The only non-user-triggered
/// motion in the app.
class LiveDot extends StatefulWidget {
  const LiveDot({super.key, this.size = 8});
  final double size;

  @override
  State<LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<LiveDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));

  @override
  void initState() {
    super.initState();
    _c.repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final live = context.tokens.live;
    final reduce = MediaQuery.disableAnimationsOf(context);
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: reduce
          ? DecoratedBox(decoration: BoxDecoration(color: live, shape: BoxShape.circle))
          : FadeTransition(
              opacity: Tween(begin: 0.45, end: 1.0).animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)),
              child: DecoratedBox(decoration: BoxDecoration(color: live, shape: BoxShape.circle)),
            ),
    );
  }
}
