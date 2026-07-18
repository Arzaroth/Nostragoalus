import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'competition_switcher.dart';
import 'widgets/async_value_view.dart';

/// The standings of players by points (movement arrow, live flag).
class LeaderboardScreen extends ConsumerWidget {
  const LeaderboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(leaderboardProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('nav.leaderboard')),
        actions: const [CompetitionSwitcher()],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(leaderboardProvider.future),
        child: AsyncValueView<LeaderboardResponse>(
          value: board,
          onRetry: () => ref.invalidate(leaderboardProvider),
          data: (res) {
            if (res.rows.isEmpty) {
              return ListView(children: [
                const SizedBox(height: 80),
                Center(child: Text(context.tr('leaderboard.empty'))),
              ]);
            }
            return ListView.separated(
              itemCount: res.rows.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) => _Row(res.rows[i]),
            );
          },
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.row);
  final RowData2 row;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(child: Text('${row.rank.toInt()}')),
      title: Text(row.displayName, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text('${row.exactCount.toInt()} exact · ${row.outcomeCount.toInt()} outcome'),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Movement(row.movement),
          const SizedBox(width: 8),
          Text('${row.totalPoints.toInt()}',
              style: Theme.of(context).textTheme.titleMedium),
        ],
      ),
    );
  }
}

class _Movement extends StatelessWidget {
  const _Movement(this.movement);
  final double? movement;

  @override
  Widget build(BuildContext context) {
    final m = movement ?? 0;
    if (m == 0) return const Icon(Icons.remove, size: 16, color: Colors.grey);
    final up = m > 0;
    return Icon(up ? Icons.arrow_drop_up : Icons.arrow_drop_down,
        color: up ? Colors.green : Colors.red);
  }
}
