import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// Group standings tables for the active competition.
class StandingsScreen extends ConsumerWidget {
  const StandingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final standings = ref.watch(standingsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('nav.standings'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(standingsProvider.future),
        child: AsyncValueView<StandingsResponse>(
          value: standings,
          onRetry: () => ref.invalidate(standingsProvider),
          data: (res) {
            if (res.groups.isEmpty) {
              return ListView(children: [
                const SizedBox(height: 80),
                Center(child: Text(context.tr('standings.empty'))),
              ]);
            }
            return ListView(
              padding: const EdgeInsets.all(12),
              children: [for (final g in res.groups) _GroupTable(g)],
            );
          },
        ),
      ),
    );
  }
}

class _GroupTable extends StatelessWidget {
  const _GroupTable(this.group);
  final Group group;

  @override
  Widget build(BuildContext context) {
    final head = Theme.of(context).textTheme.labelSmall;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(group.group, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Table(
              columnWidths: const {0: FlexColumnWidth(), 1: FixedColumnWidth(28), 2: FixedColumnWidth(28), 3: FixedColumnWidth(28)},
              children: [
                TableRow(children: [
                  Text(context.tr('standings.team'), style: head),
                  Text(context.tr('standings.p'), style: head, textAlign: TextAlign.center),
                  Text(context.tr('standings.gd'), style: head, textAlign: TextAlign.center),
                  Text(context.tr('standings.pts'), style: head, textAlign: TextAlign.center),
                ]),
                for (final r in group.rows)
                  TableRow(children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Text(r.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                    Text('${r.played.toInt()}', textAlign: TextAlign.center),
                    Text('${r.gd.toInt()}', textAlign: TextAlign.center),
                    Text('${r.points.toInt()}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontWeight: FontWeight.bold)),
                  ]),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
