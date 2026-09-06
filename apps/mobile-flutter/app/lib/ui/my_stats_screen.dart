import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/stat_tile.dart';

/// The signed-in user's headline stats across the competition.
class MyStatsScreen extends ConsumerWidget {
  const MyStatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(meStatsProvider);
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('stats.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(meStatsProvider.future),
        child: AsyncValueView<MeStatsResponse>(
          value: stats,
          onRetry: () => ref.invalidate(meStatsProvider),
          data: (res) {
            final s = res.stats;
            if (s == null) {
              return EmptyState(icon: Icons.query_stats, message: context.tr('stats.empty'));
            }
            return ListView(
              padding: const EdgeInsets.only(top: 4, bottom: 24),
              children: [
                StatBand(children: [
                  StatTile(
                      label: context.tr('stats.rank'),
                      value: s.rank != null ? '#${s.rank!.toInt()}' : '-',
                      color: s.rank == 1 ? t.gold : null),
                  StatTile(label: context.tr('analytics.points'), value: '${s.totalPoints.toInt()}'),
                ]),
                const SizedBox(height: 12),
                StatBand(children: [
                  StatTile(label: context.tr('analytics.picks'), value: '${s.predictions.toInt()}'),
                  StatTile(
                      label: context.tr('wrapped.exact'),
                      value: '${s.exact.toInt()}',
                      color: t.emerald),
                  StatTile(
                      label: context.tr('picks.joker'), value: '${s.jokers.toInt()}', color: t.amber),
                ]),
              ],
            );
          },
        ),
      ),
    );
  }
}
