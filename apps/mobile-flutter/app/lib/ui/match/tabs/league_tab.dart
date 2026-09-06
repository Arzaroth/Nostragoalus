import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/models.gen.dart';
import '../../../i18n/i18n_scope.dart';
import '../../../state/providers.dart';
import '../../../theme/app_theme.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/panel.dart';

/// How the league scored this one match.
class LeagueTab extends ConsumerWidget {
  const LeagueTab({super.key, required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    return AsyncValueView<MatchLeagueStandingsResponse>(
      value: ref.watch(matchLeagueStandingsProvider(matchId)),
      onRetry: () => ref.invalidate(matchLeagueStandingsProvider(matchId)),
      data: (res) => res.rows.isEmpty
          ? EmptyState(icon: Icons.leaderboard_outlined, message: context.tr('leaderboard.empty'))
          : ListView(
              padding: const EdgeInsets.only(top: 8, bottom: 24),
              children: [
                Panel(children: [
                  for (final r in res.rows)
                    PanelRow(
                      leading: SizedBox(
                        width: 28,
                        child: Text('${r.rank.toInt()}',
                            style: t.score(20, color: t.rankColor(r.rank.toInt()))),
                      ),
                      title: Row(
                        children: [
                          Flexible(
                              child:
                                  Text(r.displayName, maxLines: 1, overflow: TextOverflow.ellipsis)),
                          if (r.isJoker) ...[
                            const SizedBox(width: 6),
                            Icon(Icons.star, size: 14, color: t.amber),
                          ],
                        ],
                      ),
                      subtitle: Text('${r.homeGoals.toInt()} - ${r.awayGoals.toInt()}',
                          style: t.score(14, weight: FontWeight.w600, color: t.muted)),
                      trailing: Text('${r.points.toInt()}',
                          style: t.score(22, color: r.points > 0 ? t.emerald : t.faint)),
                    ),
                ]),
              ],
            ),
    );
  }
}
