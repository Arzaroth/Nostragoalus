import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// Rank movement since the previous scored round: up/down arrow plus the delta.
/// Renders nothing when the rank did not move.
class MovementArrow extends StatelessWidget {
  const MovementArrow({super.key, required this.delta});

  /// Positive means the player climbed.
  final int delta;

  @override
  Widget build(BuildContext context) {
    if (delta == 0) return const SizedBox.shrink();
    final t = context.tokens;
    final up = delta > 0;
    final color = up ? t.emerald : t.live;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(up ? Icons.arrow_drop_up : Icons.arrow_drop_down, size: 18, color: color),
        Text('${delta.abs()}',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w600)),
      ],
    );
  }
}
