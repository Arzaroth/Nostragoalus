import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// The Golden Boot pick + the tournament's top scorers. Read-only: choosing a
/// player needs a player-id source the public contract doesn't expose, so the
/// pick itself stays on the web for now.
class BestScorerScreen extends ConsumerWidget {
  const BestScorerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final best = ref.watch(bestScorerProvider);
    final scorers = ref.watch(scorersProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('bestScorer.title'))),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(bestScorerProvider);
          ref.invalidate(scorersProvider);
        },
        child: AsyncValueView<BestScorerResponse>(
          value: best,
          onRetry: () => ref.invalidate(bestScorerProvider),
          data: (bs) => ListView(
            children: [
              if (bs.myPick != null)
                Card(
                  margin: const EdgeInsets.all(12),
                  color: Theme.of(context).colorScheme.primaryContainer,
                  child: ListTile(
                    leading: const Icon(Icons.sports_soccer),
                    title: Text(bs.myPick!.playerName),
                    subtitle: Text(bs.myPick!.teamName),
                    trailing: Text('${bs.myPick!.awardedPoints}'),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text(context.tr('bestScorer.topScorers'),
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              scorers.maybeWhen(
                data: (sc) => Column(
                  children: [
                    for (final s in sc.scorers.take(20))
                      ListTile(
                        dense: true,
                        leading: Text('${s.goals.toInt()}',
                            style: Theme.of(context).textTheme.titleMedium),
                        title: Text(s.playerName),
                        subtitle: Text(s.teamName),
                      ),
                  ],
                ),
                orElse: () => const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
