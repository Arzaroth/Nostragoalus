import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'match_detail_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/match_card.dart';
import 'widgets/panel.dart';

/// i18n key for a scoring tier (EXACT / DIFF / OUTCOME / MISS).
String tierKey(BaseTierValue baseTier) => switch (baseTier) {
      BaseTierValue.exact => 'analytics.tier.exact',
      BaseTierValue.diff => 'analytics.tier.diff',
      BaseTierValue.outcome => 'analytics.tier.outcome',
      _ => 'analytics.tier.miss',
    };

/// The signed-in user's predictions across matches, newest first.
class MyPredictionsScreen extends ConsumerWidget {
  const MyPredictionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preds = ref.watch(myPredictionsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('predictions.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(myPredictionsProvider.future),
        child: AsyncValueView<PredictionsResponse>(
          value: preds,
          onRetry: () => ref.invalidate(myPredictionsProvider),
          data: (res) {
            if (res.predictions.isEmpty) {
              return EmptyState(
                  icon: Icons.sports_soccer_outlined, message: context.tr('predictions.empty'));
            }
            return ListView(
              padding: const EdgeInsets.only(top: 4, bottom: 24),
              children: [
                Panel(children: [for (final p in res.predictions) _PredictionTile(p)]),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// The fixture as a [MatchCard] with the pick on its subline, then a quiet
/// line for the joker, the scoring tier and the points once scored.
class _PredictionTile extends StatelessWidget {
  const _PredictionTile(this.p);
  final Prediction p;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final l = MaterialLocalizations.of(context);
    final k = p.kickoffTime.toLocal();
    final time = l.formatTimeOfDay(TimeOfDay.fromDateTime(k));
    final tier = p.baseTier;
    final tierColor = switch (tier) {
      BaseTierValue.exact => t.emerald,
      BaseTierValue.diff => theme.colorScheme.primary,
      BaseTierValue.outcome => t.muted,
      _ => t.faint,
    };
    final hasMeta = p.isJoker || tier != null || p.totalPoints != null;
    return InkWell(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => MatchDetailScreen(matchId: p.matchId)),
      ),
      child: Column(
        children: [
          MatchCard(
            homeTeam: p.homeTeam,
            awayTeam: p.awayTeam,
            homeCode: p.homeTeamCode,
            awayCode: p.awayTeamCode,
            status: p.status,
            kickoffLabel: '${l.formatMediumDate(k)} · $time',
            kickoffTime: time,
            homeGoals: p.fullTimeHome,
            awayGoals: p.fullTimeAway,
            pickLabel: '${context.tr('match.yourPick')} ${p.homeGoals} - ${p.awayGoals}',
          ),
          if (hasMeta)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Row(
                children: [
                  if (p.isJoker) ...[
                    Tag(context.tr('picks.joker'), color: t.amber, icon: Icons.star),
                    const SizedBox(width: 8),
                  ],
                  if (tier != null) Tag(context.tr(tierKey(tier)), color: tierColor),
                  const Spacer(),
                  if (p.totalPoints != null) ...[
                    Text('${p.totalPoints}', style: t.score(22)),
                    const SizedBox(width: 4),
                    Text(context.tr('leaderboard.pts'),
                        style: theme.textTheme.labelSmall?.copyWith(color: t.faint)),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}
