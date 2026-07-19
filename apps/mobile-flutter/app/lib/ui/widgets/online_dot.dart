import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';

/// A small presence dot for a user: green when active, amber when idle, hidden
/// when offline/unknown. Driven by the live presenceProvider.
class OnlineDot extends ConsumerWidget {
  const OnlineDot({super.key, required this.userId, this.size = 10});
  final String userId;
  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(presenceProvider)[userId];
    final color = switch (status) {
      'active' => Colors.green,
      'idle' => Colors.amber,
      _ => null,
    };
    if (color == null) return SizedBox(width: size, height: size);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
    );
  }
}
