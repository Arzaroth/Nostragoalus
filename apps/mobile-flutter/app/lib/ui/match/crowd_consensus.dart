import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/panel.dart';

/// A crowd total is only renderable above the server's anonymity floor; a
/// non-positive count is the below-minimum sentinel (CrowdLine.vue).
bool usableCrowdTotal(Object? t) => t is CrowdResponseTotal && t.count > 0;

/// Crowd consensus for one match, shown under the prediction input when the
/// show-crowd preference is on. Silent when off, loading, or below the
/// anonymity floor. REST-only: it does not receive `crowd:update` WS patches.
///
/// Under the league lens the card shows that league's members and the everyone
/// line rides beneath it, because the scoring crowd bonus is always computed
/// from everyone. A league too small to clear the anonymity floor falls back to
/// the everyone card rather than showing nothing.
class CrowdConsensus extends ConsumerWidget {
  const CrowdConsensus({
    super.key,
    required this.matchId,
    required this.homeTeam,
    required this.awayTeam,
  });

  final String matchId;
  final String homeTeam;
  final String awayTeam;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final showCrowd = ref.watch(authControllerProvider).valueOrNull?.showCrowd ?? false;
    if (!showCrowd) return const SizedBox.shrink();
    final global = ref.watch(crowdTotalsProvider).valueOrNull?[matchId];
    final leagueId = ref.watch(selectedLeagueIdProvider);
    final leagueTotal = leagueId == null
        ? null
        : ref.watch(leagueCrowdTotalsProvider).valueOrNull?[matchId];
    final lensed = usableCrowdTotal(leagueTotal);
    final t = lensed ? leagueTotal! : global;
    if (!usableCrowdTotal(t)) return const SizedBox.shrink();
    final total = t!.home + t.away;
    final theme = Theme.of(context);
    final tokens = context.tokens;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PanelHeading(
            title: context.tr('crowd.title'),
            trailing: context.tr('crowd.count', {'n': t.count.toInt()}),
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
          ),
          Panel(
            margin: EdgeInsets.zero,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            children: [
              if (lensed)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: Tag(context.tr('leagues.crowdLeague'), icon: Icons.groups),
                  ),
                ),
              Row(
                children: [
                  Expanded(
                    child: Text(homeTeam,
                        textAlign: TextAlign.end,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text('${t.home.toInt()} - ${t.away.toInt()}', style: tokens.score(26)),
                  ),
                  Expanded(
                    child: Text(awayTeam,
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleSmall),
                  ),
                ],
              ),
              if (total > 0) ...[
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(3),
                  child: LinearProgressIndicator(value: t.home / total, minHeight: 6),
                ),
              ],
              if (lensed && usableCrowdTotal(global)) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Icon(Icons.public, size: 14, color: tokens.faint),
                    const SizedBox(width: 6),
                    Text(context.tr('leagues.global'),
                        style: theme.textTheme.labelSmall?.copyWith(color: tokens.muted)),
                    const Spacer(),
                    Text('${global!.home.toInt()} - ${global.away.toInt()}',
                        style: tokens.score(16, color: tokens.muted)),
                  ],
                ),
                const SizedBox(height: 6),
                Text(context.tr('leagues.crowdBonusHint'),
                    style: theme.textTheme.labelSmall?.copyWith(color: tokens.faint)),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
