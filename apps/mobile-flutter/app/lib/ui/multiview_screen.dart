import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'match_detail_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/score_pill.dart';
import 'widgets/team_flag.dart';

/// A grid of the in-play matches, updated live over the WS hub.
class MultiviewScreen extends ConsumerWidget {
  const MultiviewScreen({super.key});

  static const _live = {StatusValue.live, StatusValue.paused};

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matches = ref.watch(matchesProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('nav.multiview'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(matchesProvider.future),
        child: AsyncValueView<MatchesResponse>(
          value: matches,
          onRetry: () => ref.invalidate(matchesProvider),
          data: (res) {
            final live = res.matches.where((m) => _live.contains(m.status)).toList();
            if (live.isEmpty) {
              return EmptyState(icon: Icons.grid_view_outlined, message: context.tr('multiview.empty'));
            }
            return GridView.count(
              crossAxisCount: 2,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.15,
              children: [for (final m in live) _Tile(m)],
            );
          },
        ),
      ),
    );
  }
}

/// One live fixture on its own board: flags, names and the live scoreboard.
class _Tile extends StatelessWidget {
  const _Tile(this.match);
  final MatchesResponseMatch match;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    Widget team(String name, String? code) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            TeamFlag(code, height: 16),
            const SizedBox(width: 8),
            Flexible(
              child: Text(name,
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.labelMedium),
            ),
          ],
        );
    return Material(
      color: t.board,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: t.rule),
      ),
      child: InkWell(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => MatchDetailScreen(matchId: match.id)),
        ),
        child: Container(
          decoration: BoxDecoration(
            border: BorderDirectional(start: BorderSide(color: t.live, width: 3)),
          ),
          padding: const EdgeInsets.fromLTRB(10, 12, 12, 12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              team(match.homeTeam, match.homeTeamCode),
              const SizedBox(height: 8),
              ScorePill(
                  status: match.status,
                  home: match.fullTimeHome,
                  away: match.fullTimeAway,
                  size: 30),
              const SizedBox(height: 8),
              team(match.awayTeam, match.awayTeamCode),
            ],
          ),
        ),
      ),
    );
  }
}
