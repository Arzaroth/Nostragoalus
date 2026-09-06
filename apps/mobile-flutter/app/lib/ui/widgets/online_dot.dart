import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';

/// A small presence dot for a user: emerald when active, amber when idle,
/// faint when offline/unknown. Ringed in the board colour so it reads when it
/// sits on an avatar. Driven by the live presenceProvider.
class OnlineDot extends ConsumerWidget {
  const OnlineDot({super.key, required this.userId, this.size = 10});
  final String userId;
  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final status = ref.watch(presenceProvider)[userId];
    final color = switch (status) {
      'active' => t.emerald,
      'idle' => t.amber,
      _ => t.faint,
    };
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
        border: Border.all(color: t.board, width: 1.5),
      ),
    );
  }
}
