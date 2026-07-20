import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';

/// The "counterfactual" - how an earlier prediction would have scored vs the one
/// the user kept. Only shown once there's a live/final scope to compare against.
class PastPicks extends ConsumerWidget {
  const PastPicks({super.key, required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(pastPicksProvider(matchId)).maybeWhen(
          data: (res) {
            final earlier = res.earlier;
            if (res.scope == ScopeValue.none || earlier == null) return const SizedBox.shrink();
            final kept = res.kept;
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(context.tr('pastPick.title'),
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    Text(context.tr('pastPick.earlier', {
                      'score': '${earlier.home.toInt()}-${earlier.away.toInt()}',
                      'n': earlier.points.toInt(),
                    })),
                    if (kept != null)
                      Text(context.tr('pastPick.kept', {
                        'score': '${kept.home.toInt()}-${kept.away.toInt()}',
                        'n': kept.points.toInt(),
                      })),
                  ],
                ),
              ),
            );
          },
          orElse: () => const SizedBox.shrink(),
        );
  }
}
