import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/app_bar_picker.dart';

/// App-bar competition picker. Selecting a competition sets the slug the scoped
/// reads (matches / standings / leaderboard / scorers / champion) filter by.
class CompetitionSwitcher extends ConsumerWidget {
  const CompetitionSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final competitions = ref.watch(competitionsProvider).valueOrNull?.competitions;
    if (competitions == null || competitions.isEmpty) return const SizedBox.shrink();
    final selected = ref.watch(selectedCompetitionProvider);

    var current = '';
    for (final c in competitions) {
      if (c.slug == selected) current = c.name;
    }
    return AppBarPicker<String>(
      icon: Icons.swap_horiz,
      label: current.isEmpty
          ? context.tr('nav.competition')
          : '${context.tr('nav.competition')}: $current',
      selected: selected ?? '',
      onSelected: (slug) => ref.read(selectedCompetitionProvider.notifier).state = slug,
      options: [
        for (final c in competitions) PickerOption(value: c.slug, label: c.name),
      ],
    );
  }
}
