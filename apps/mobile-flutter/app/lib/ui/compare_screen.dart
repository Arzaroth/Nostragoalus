import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'widgets/async_value_view.dart';
import 'widgets/panel.dart';
import 'widgets/stat_tile.dart';

/// Player head-to-head: self vs a leaderboard opponent, in the selected
/// competition. Pick an opponent, then the h2h breakdown loads.
class CompareScreen extends ConsumerStatefulWidget {
  const CompareScreen({super.key});
  @override
  ConsumerState<CompareScreen> createState() => _CompareScreenState();
}

class _CompareScreenState extends ConsumerState<CompareScreen> {
  // The id, never the row: generated models have identity equality, so a
  // refetched row would no longer match any dropdown item.
  String? _opponentId;

  @override
  Widget build(BuildContext context) {
    final self = ref.watch(authControllerProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('compare.title'))),
      body: AsyncValueView<LeaderboardResponse>(
        value: ref.watch(leaderboardProvider),
        onRetry: () => ref.invalidate(leaderboardProvider),
        data: (board) {
          final opponents = board.rows.where((r) => r.userId != self?.id).toList();
          final selected =
              opponents.any((r) => r.userId == _opponentId) ? _opponentId : null;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              DropdownButtonFormField<String>(
                initialValue: selected,
                isExpanded: true,
                decoration: InputDecoration(labelText: context.tr('compare.pickOpponent')),
                items: [
                  for (final r in opponents)
                    DropdownMenuItem(value: r.userId, child: Text(r.displayName)),
                ],
                onChanged: (id) => setState(() => _opponentId = id),
              ),
              const SizedBox(height: 16),
              if (self != null && selected != null) _H2H(a: self.id, b: selected),
            ],
          );
        },
      ),
    );
  }
}

class _H2H extends ConsumerWidget {
  const _H2H({required this.a, required this.b});
  final String a;
  final String b;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final t = context.tokens;
    return AsyncValueView<Map<String, dynamic>>(
      value: ref.watch(headToHeadProvider((a, b))),
      onRetry: () => ref.invalidate(headToHeadProvider((a, b))),
      data: (h) {
        if (h['hasData'] != true) {
          return Padding(
            padding: const EdgeInsets.all(24),
            child: Center(
              child: Text(context.tr('compare.noShared'),
                  style: theme.textTheme.bodyMedium?.copyWith(color: t.muted)),
            ),
          );
        }
        final an = ((h['a'] as Map?)?['name'] ?? '?').toString();
        final bn = ((h['b'] as Map?)?['name'] ?? '?').toString();
        final aPts = (h['aPoints'] as num?)?.toInt() ?? 0;
        final bPts = (h['bPoints'] as num?)?.toInt() ?? 0;
        final aWins = (h['aWins'] as num?)?.toInt() ?? 0;
        final bWins = (h['bWins'] as num?)?.toInt() ?? 0;
        final ties = (h['ties'] as num?)?.toInt() ?? 0;
        final shared = (h['shared'] as num?)?.toInt() ?? 0;
        final agreement = (h['agreement'] as Map?) ?? const {};
        final overTime = (h['overTime'] as List?) ?? const [];
        final divergences = (h['divergences'] as List?) ?? const [];
        const heading = EdgeInsets.fromLTRB(4, 20, 4, 8);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            StatBand(margin: EdgeInsets.zero, children: [
              StatTile(
                  label: an, value: '$aPts', color: aPts > bPts ? t.emerald : null),
              StatTile(
                  label: bn, value: '$bPts', color: bPts > aPts ? t.emerald : null),
            ]),
            const SizedBox(height: 12),
            Panel(
              margin: EdgeInsets.zero,
              padding: const EdgeInsets.all(16),
              children: [
                Text(context
                    .tr('compare.record')
                    .replaceAll('{a}', '$aWins')
                    .replaceAll('{t}', '$ties')
                    .replaceAll('{b}', '$bWins')),
                const SizedBox(height: 2),
                Text(context.tr('compare.shared').replaceAll('{n}', '$shared'),
                    style: theme.textTheme.bodySmall),
              ],
            ),
            PanelHeading(title: context.tr('compare.agreement'), padding: heading),
            Panel(
              margin: EdgeInsets.zero,
              padding: const EdgeInsets.all(16),
              children: [
                Text(context
                    .tr('compare.sameScore')
                    .replaceAll('{n}', '${(agreement['sameScore'] as num?)?.toInt() ?? 0}')),
                const SizedBox(height: 2),
                Text(context
                    .tr('compare.sameOutcome')
                    .replaceAll('{n}', '${(agreement['sameOutcome'] as num?)?.toInt() ?? 0}')),
              ],
            ),
            if (overTime.isNotEmpty) ...[
              PanelHeading(title: context.tr('analytics.overTimeTitle'), padding: heading),
              Panel(
                margin: EdgeInsets.zero,
                children: [
                  for (final r in overTime.whereType<Map<String, dynamic>>())
                    PanelRow(
                      title: Text((r['label'] ?? '').toString()),
                      trailing: Text(
                          '${(r['aPoints'] as num?)?.toInt() ?? 0} - ${(r['bPoints'] as num?)?.toInt() ?? 0}',
                          style: t.score(20)),
                    ),
                ],
              ),
            ],
            if (divergences.isNotEmpty) ...[
              PanelHeading(title: context.tr('compare.divergences'), padding: heading),
              Panel(
                margin: EdgeInsets.zero,
                children: [
                  for (final m in divergences.whereType<Map<String, dynamic>>())
                    _Divergence(m: m, an: an, bn: bn),
                ],
              ),
            ],
          ],
        );
      },
    );
  }
}

/// One match both players called differently: the result on the scoreboard,
/// each player's pick and points beneath.
class _Divergence extends StatelessWidget {
  const _Divergence({required this.m, required this.an, required this.bn});
  final Map<String, dynamic> m;
  final String an;
  final String bn;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final aPts = (m['aPoints'] as num?)?.toInt() ?? 0;
    final bPts = (m['bPoints'] as num?)?.toInt() ?? 0;
    Widget pick(String name, Object? predicted, int pts) => Expanded(
          child: Row(
            children: [
              Flexible(
                child: Text(name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelSmall?.copyWith(color: t.muted)),
              ),
              const SizedBox(width: 6),
              Text('$predicted', style: t.score(15, weight: FontWeight.w600)),
              const SizedBox(width: 6),
              Text('${pts >= 0 ? '+' : ''}$pts',
                  style: t.score(15, weight: FontWeight.w600, color: pts > 0 ? t.emerald : t.faint)),
            ],
          ),
        );
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('${m['home']}',
                    textAlign: TextAlign.end,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text('${m['actual']}', style: t.score(22)),
              ),
              Expanded(
                child: Text('${m['away']}',
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleSmall),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(children: [pick(an, m['aPredicted'], aPts), pick(bn, m['bPredicted'], bPts)]),
        ],
      ),
    );
  }
}
