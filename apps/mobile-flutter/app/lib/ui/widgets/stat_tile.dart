import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'panel.dart';

/// A labelled scoreboard number. On its own it is a bare column; put several in
/// a [StatBand] to get the hairline-split strip the dashboards lead with.
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value, this.sub, this.color});
  final String label;
  final String value;
  final String? sub;

  /// Tints the numeral (emerald for a win, live red for a loss).
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value,
              style: t.score(34, color: color ?? theme.colorScheme.onSurface),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          Text(label, style: theme.textTheme.labelMedium?.copyWith(color: t.muted)),
          if (sub != null) Text(sub!, style: theme.textTheme.labelSmall?.copyWith(color: t.faint)),
        ],
      ),
    );
  }
}

/// A strip of [StatTile]s on one board, split by vertical hairlines.
class StatBand extends StatelessWidget {
  const StatBand({super.key, required this.children, this.margin});
  final List<Widget> children;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    final cells = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0) cells.add(VerticalDivider(width: 1, thickness: 1, color: context.tokens.rule));
      cells.add(Expanded(child: children[i]));
    }
    return Panel(
      margin: margin ?? const EdgeInsets.symmetric(horizontal: 16),
      dividers: false,
      children: [
        IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: cells)),
      ],
    );
  }
}
