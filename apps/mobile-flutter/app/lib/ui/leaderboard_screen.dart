import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'cabinet_screen.dart';
import 'competition_switcher.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/movement_arrow.dart';

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
              return EmptyState(message: context.tr('leaderboard.empty'));
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
  final LeaderboardResponseRow row;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(child: Text('${row.rank.toInt()}')),
      title: Text(row.displayName, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text('${row.exactCount.toInt()} ${context.tr('leaderboard.exact')} · '
          '${row.outcomeCount.toInt()} ${context.tr('leaderboard.correct')}'),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => CabinetScreen(userId: row.userId, name: row.displayName),
      )),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          MovementArrow(delta: (row.movement ?? 0).toInt()),
          const SizedBox(width: 8),
          Text('${row.totalPoints.toInt()}',
              style: Theme.of(context).textTheme.titleMedium),
        ],
      ),
    );
  }
}
