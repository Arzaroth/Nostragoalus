import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/models.gen.dart';
import '../../../i18n/i18n_scope.dart';
import '../../../state/providers.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/empty_state.dart';

/// How the league scored this one match.
class LeagueTab extends ConsumerWidget {
  const LeagueTab({super.key, required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<MatchLeagueStandingsResponse>(
      value: ref.watch(matchLeagueStandingsProvider(matchId)),
      onRetry: () => ref.invalidate(matchLeagueStandingsProvider(matchId)),
      data: (res) => res.rows.isEmpty
          ? EmptyState(message: context.tr('leaderboard.empty'))
          : ListView(
              children: [
                for (final r in res.rows)
                  ListTile(
                    dense: true,
                    leading: Text('${r.rank.toInt()}'),
                    title: Text(r.displayName),
                    subtitle: Text('${r.homeGoals.toInt()}-${r.awayGoals.toInt()}'),
                    trailing: Text('${r.points.toInt()}'),
                  ),
              ],
            ),
    );
  }
}
