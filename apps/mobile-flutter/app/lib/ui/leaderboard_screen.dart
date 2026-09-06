import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'cabinet_screen.dart';
import 'competition_switcher.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/leaderboard_row_card.dart';

/// The standings of players by points, one panel of [LeaderboardRowCard] rows
/// (rank, movement, champion/best-scorer flags, live points); the signed-in
/// row is tinted.
class LeaderboardScreen extends ConsumerWidget {
  const LeaderboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(leaderboardProvider);
    final meId = ref.watch(authControllerProvider).valueOrNull?.id;
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('leaderboard.title')),
        actions: const [CompetitionSwitcher()],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(leaderboardProvider.future),
        child: AsyncValueView<LeaderboardResponse>(
          value: board,
          onRetry: () => ref.invalidate(leaderboardProvider),
          data: (res) {
            if (res.rows.isEmpty) {
              return EmptyState(icon: Icons.leaderboard_outlined, message: context.tr('leaderboard.empty'));
            }
            return CustomScrollView(
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                  sliver: DecoratedSliver(
                    decoration: ShapeDecoration(
                      color: t.board,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                        side: BorderSide(color: t.rule),
                      ),
                    ),
                    sliver: SliverList.separated(
                      itemCount: res.rows.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, i) {
                        final row = res.rows[i];
                        return LeaderboardRowCard(
                          row: row,
                          meId: meId,
                          radius: BorderRadius.vertical(
                            top: Radius.circular(i == 0 ? 16 : 0),
                            bottom: Radius.circular(i == res.rows.length - 1 ? 16 : 0),
                          ),
                          onTap: () => Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) =>
                                CabinetScreen(userId: row.userId, name: row.displayName),
                          )),
                        );
                      },
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
