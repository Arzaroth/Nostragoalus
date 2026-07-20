import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';

/// Crowd consensus for one match, shown under the prediction input when the
/// show-crowd preference is on. Silent when off, loading, or below the
/// anonymity floor. REST-only: it does not receive `crowd:update` WS patches.
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
    final t = ref.watch(crowdTotalsProvider).valueOrNull?[matchId];
    // A non-positive count is the server's below-minimum sentinel (CrowdLine.vue).
    if (t is! CrowdResponseTotal || t.count <= 0) return const SizedBox.shrink();
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.tr('crowd.title'), style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Expanded(child: Text(homeTeam, textAlign: TextAlign.end)),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Text('${t.home.toInt()} - ${t.away.toInt()}',
                      style: Theme.of(context).textTheme.titleLarge),
                ),
                Expanded(child: Text(awayTeam)),
              ],
            ),
            const SizedBox(height: 4),
            Center(
              child: Text(context.tr('crowd.count', {'n': t.count.toInt()}),
                  style: Theme.of(context).textTheme.bodySmall),
            ),
          ],
        ),
      ),
    );
  }
}
