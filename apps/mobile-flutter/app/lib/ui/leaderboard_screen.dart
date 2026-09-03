import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'cabinet_screen.dart';
import 'competition_switcher.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/leaderboard_row_card.dart';

/// The standings of players by points, each row a [LeaderboardRowCard] (medal,
/// movement, champion/best-scorer flags, live points); the signed-in row is
/// outlined.
class LeaderboardScreen extends ConsumerWidget {
  const LeaderboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(leaderboardProvider);
    final meId = ref.watch(authControllerProvider).valueOrNull?.id;
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
            return ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 4),
              itemCount: res.rows.length,
              itemBuilder: (context, i) {
                final row = res.rows[i];
                return LeaderboardRowCard(
                  row: row,
                  meId: meId,
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => CabinetScreen(userId: row.userId, name: row.displayName),
                  )),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
