import 'package:flutter/material.dart';

/// Rank movement since the previous scored round: up/down arrow plus the delta.
/// Renders nothing when the rank did not move.
class MovementArrow extends StatelessWidget {
  const MovementArrow({super.key, required this.delta});

  /// Positive means the player climbed.
  final int delta;

  @override
  Widget build(BuildContext context) {
    if (delta == 0) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final up = delta > 0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(up ? Icons.arrow_drop_up : Icons.arrow_drop_down,
            size: 20, color: up ? scheme.primary : scheme.error),
        Text('${delta.abs()}',
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(color: up ? scheme.primary : scheme.error)),
      ],
    );
  }
}
