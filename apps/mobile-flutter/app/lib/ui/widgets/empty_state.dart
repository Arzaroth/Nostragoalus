import 'package:flutter/material.dart';

/// Centred "nothing here" message. Scrollable so it still works as the body of
/// a `RefreshIndicator`, which is why the old copies were `ListView`s.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.message, this.icon});

  final String message;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => ListView(
        children: [
          const SizedBox(height: 80),
          if (icon != null) ...[
            Icon(icon, size: 40, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 12),
          ],
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(message, textAlign: TextAlign.center),
          ),
        ],
      );
}
