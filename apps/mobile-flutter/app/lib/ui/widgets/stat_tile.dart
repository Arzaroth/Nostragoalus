import 'package:flutter/material.dart';

/// A labelled headline number.
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value, this.sub});
  final String label;
  final String value;
  final String? sub;

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.all(6),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(value, style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 4),
              Text(label,
                  style: Theme.of(context).textTheme.labelMedium, textAlign: TextAlign.center),
              if (sub != null)
                Text(sub!,
                    style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            ],
          ),
        ),
      );
}
