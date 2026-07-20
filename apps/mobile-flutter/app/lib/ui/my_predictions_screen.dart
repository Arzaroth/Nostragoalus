import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'match_detail_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';

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
              return EmptyState(message: context.tr('predictions.empty'));
            }
            return ListView.separated(
              itemCount: res.predictions.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) => _PredictionTile(res.predictions[i]),
            );
          },
        ),
      ),
    );
  }
}

class _PredictionTile extends StatelessWidget {
  const _PredictionTile(this.p);
  final Prediction p;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: p.isJoker
          ? const Icon(Icons.star, color: Colors.amber)
          : const Icon(Icons.sports_soccer),
      title: Text('${p.homeGoals} - ${p.awayGoals}'),
      subtitle: p.baseTier != null ? Text(context.tr(tierKey(p.baseTier!))) : null,
      trailing: p.totalPoints != null
          ? Text('${p.totalPoints} ${context.tr('leaderboard.pts')}',
              style: Theme.of(context).textTheme.titleMedium)
          : null,
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => MatchDetailScreen(matchId: p.matchId)),
      ),
    );
  }
}
