import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/panel.dart';

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
    final theme = Theme.of(context);
    final tokens = context.tokens;
    final total = t.home + t.away;
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
            ],
          ),
        ],
      ),
    );
  }
}
