import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/panel.dart';

/// A crowd total is only renderable above the server's anonymity floor. The
/// server drops a below-floor match from the map entirely, so the usual shape of
/// "too few picks" is an ABSENT matchId. The count check additionally rejects
/// the zero-count sentinel the web sees on a live `crowd:update` push, which
/// this REST-only card would otherwise render as a real 0-0 consensus the day it
/// starts consuming those frames.
bool _usable(CrowdResponseTotal? t) => t != null && t.count > 0;

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
    // While the lens is switching, riverpod still serves the PREVIOUS league's
    // totals next to the loading state. Rendering those under the new league's
    // tag would attribute one league's consensus to another, so a lensed read
    // only counts once it has settled.
    final leagueAsync = ref.watch(leagueCrowdTotalsProvider);
    final leagueTotal = leagueAsync.isLoading ? null : leagueAsync.valueOrNull?[matchId];
    final lensed = _usable(leagueTotal);
    final t = lensed ? leagueTotal : global;
    if (!_usable(t)) return const SizedBox.shrink();
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
              if (lensed && _usable(global)) ...[
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
