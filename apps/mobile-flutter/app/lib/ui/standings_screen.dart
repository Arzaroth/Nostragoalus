import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'competition_switcher.dart';
import 'scorers_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/group_standings_table.dart';

/// Group standings tables for the active competition, one panel per group.
class StandingsScreen extends ConsumerWidget {
  const StandingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final standings = ref.watch(standingsProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('nav.standings')),
        actions: [
          IconButton(
            icon: const Icon(Icons.sports_soccer_outlined),
            tooltip: context.tr('nav.scorers'),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ScorersScreen()),
            ),
          ),
          const CompetitionSwitcher(),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(standingsProvider.future),
        child: AsyncValueView<StandingsResponse>(
          value: standings,
          onRetry: () => ref.invalidate(standingsProvider),
          data: (res) {
            if (res.groups.isEmpty) {
              return EmptyState(icon: Icons.table_chart_outlined, message: context.tr('standings.empty'));
            }
            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                for (final g in res.groups)
                  GroupStandingsTable(
                    title: context.tr('matches.group', {'group': g.group}),
                    rows: g.rows,
                    headingPadding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
