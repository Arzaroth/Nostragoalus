import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/providers.dart';

/// App-bar competition picker. Selecting a competition sets the slug the scoped
/// reads (matches / standings / leaderboard / scorers / champion) filter by.
class CompetitionSwitcher extends ConsumerWidget {
  const CompetitionSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final competitions = ref.watch(competitionsProvider);
    final selected = ref.watch(selectedCompetitionProvider);

    return competitions.maybeWhen(
      data: (res) {
        if (res.competitions.isEmpty) return const SizedBox.shrink();
        String? current;
        for (final c in res.competitions) {
          if (c.slug == selected) current = c.name;
        }
        return PopupMenuButton<String?>(
          icon: const Icon(Icons.swap_horiz),
          tooltip: current,
          onSelected: (slug) => ref.read(selectedCompetitionProvider.notifier).state = slug,
          itemBuilder: (context) => [
            for (final c in res.competitions)
              CheckedPopupMenuItem(
                value: c.slug,
                checked: c.slug == selected,
                child: Text(c.name),
              ),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}
