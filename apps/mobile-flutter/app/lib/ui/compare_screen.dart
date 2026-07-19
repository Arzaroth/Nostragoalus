import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// Player head-to-head: self vs a leaderboard opponent, in the selected
/// competition. Pick an opponent, then the h2h breakdown loads.
class CompareScreen extends ConsumerStatefulWidget {
  const CompareScreen({super.key});
  @override
  ConsumerState<CompareScreen> createState() => _CompareScreenState();
}

class _CompareScreenState extends ConsumerState<CompareScreen> {
  RowData2? _opponent;

  @override
  Widget build(BuildContext context) {
    final self = ref.watch(authControllerProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('compare.title'))),
      body: AsyncValueView<LeaderboardResponse>(
        value: ref.watch(leaderboardProvider),
        onRetry: () => ref.invalidate(leaderboardProvider),
        data: (board) {
          final opponents =
              board.rows.where((r) => r.userId != self?.id).toList();
          return ListView(
            padding: const EdgeInsets.all(12),
            children: [
              DropdownButtonFormField<RowData2>(
                initialValue: _opponent,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: context.tr('compare.pickOpponent'),
                  border: const OutlineInputBorder(),
                ),
                items: [
                  for (final r in opponents)
                    DropdownMenuItem(value: r, child: Text(r.displayName)),
                ],
                onChanged: (r) => setState(() => _opponent = r),
              ),
              const SizedBox(height: 16),
              if (self != null && _opponent != null)
                _H2H(a: self.id, b: _opponent!.userId),
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
    return AsyncValueView<Map<String, dynamic>>(
      value: ref.watch(headToHeadProvider((a, b))),
      onRetry: () => ref.invalidate(headToHeadProvider((a, b))),
      data: (h) {
        if (h['hasData'] != true) {
          return Center(child: Text(context.tr('compare.noShared')));
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
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(children: [
                  Row(
                    children: [
                      Expanded(child: Text(an, textAlign: TextAlign.center)),
                      Expanded(child: Text(bn, textAlign: TextAlign.center)),
                    ],
                  ),
                  Row(
                    children: [
                      Expanded(
                          child: Text('$aPts',
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.headlineMedium)),
                      Expanded(
                          child: Text('$bPts',
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.headlineMedium)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(context
                      .tr('compare.record')
                      .replaceAll('{a}', '$aWins')
                      .replaceAll('{t}', '$ties')
                      .replaceAll('{b}', '$bWins')),
                  Text(context.tr('compare.shared').replaceAll('{n}', '$shared'),
                      style: Theme.of(context).textTheme.bodySmall),
                ]),
              ),
            ),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(context.tr('compare.agreement'),
                      style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 6),
                  Text(context
                      .tr('compare.sameScore')
                      .replaceAll('{n}', '${(agreement['sameScore'] as num?)?.toInt() ?? 0}')),
                  Text(context
                      .tr('compare.sameOutcome')
                      .replaceAll('{n}', '${(agreement['sameOutcome'] as num?)?.toInt() ?? 0}')),
                ]),
              ),
            ),
            if (overTime.isNotEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(context.tr('analytics.overTimeTitle'),
                        style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 6),
                    for (final r in overTime.cast<Map>())
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text((r['label'] ?? '').toString()),
                        trailing: Text(
                            '${(r['aPoints'] as num?)?.toInt() ?? 0} - ${(r['bPoints'] as num?)?.toInt() ?? 0}'),
                      ),
                  ]),
                ),
              ),
            if (divergences.isNotEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(context.tr('compare.divergences'),
                        style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 6),
                    for (final m in divergences.cast<Map>())
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text('${m['home']} ${m['actual']} ${m['away']}'),
                        subtitle: Text(
                            '$an ${m['aPredicted']} (${(m['aPoints'] as num?)?.toInt() ?? 0}) · '
                            '$bn ${m['bPredicted']} (${(m['bPoints'] as num?)?.toInt() ?? 0})'),
                      ),
                  ]),
                ),
              ),
          ],
        );
      },
    );
  }
}
