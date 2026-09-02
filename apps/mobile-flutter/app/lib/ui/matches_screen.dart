import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'competition_switcher.dart';
import 'match_detail_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/match_card.dart';
import 'widgets/notifications_bell.dart';
import 'widgets/stat_tile.dart';

/// Fixtures list, grouped by round. A round whose matches have all been played
/// starts collapsed (the final is never folded), so the list lands on what is
/// still to come. Tap a match to open its detail + make a prediction.
class MatchesScreen extends ConsumerWidget {
  const MatchesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matches = ref.watch(matchesProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('nav.matches')),
        actions: const [CompetitionSwitcher(), NotificationsBell()],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(matchesProvider.future),
        child: AsyncValueView<MatchesResponse>(
          value: matches,
          onRetry: () => ref.invalidate(matchesProvider),
          data: (res) {
            if (res.matches.isEmpty) {
              return EmptyState(message: context.tr('matches.empty'));
            }
            final rounds = groupByRound(res.matches);
            return ListView(
              children: [
                const _StatHeader(),
                for (final r in rounds) _RoundGroup(r),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// The web fixtures page leads with the player's standing; mirror a compact
/// Points / Rank / Exact strip above the list, read off the leaderboard the
/// leaderboard tab already fetches. Renders nothing until it resolves, so it
/// never delays or blocks the fixtures.
class _StatHeader extends ConsumerWidget {
  const _StatHeader();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(leaderboardProvider).valueOrNull;
    final myId = ref.watch(authControllerProvider).valueOrNull?.id;
    if (board == null || myId == null) return const SizedBox.shrink();

    LeaderboardResponseRow? mine;
    for (final r in board.rows) {
      if (r.userId == myId) {
        mine = r;
        break;
      }
    }
    if (mine == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      child: Row(
        children: [
          Expanded(
              child: StatTile(
                  label: context.tr('picks.points'), value: '${mine.totalPoints.toInt()}')),
          Expanded(
              child: StatTile(label: context.tr('stats.rank'), value: '#${mine.rank.toInt()}')),
          Expanded(
              child: StatTile(
                  label: context.tr('picks.exact'), value: '${mine.exactCount.toInt()}')),
        ],
      ),
    );
  }
}

/// Fixtures bucketed by round, in the competition's round order.
List<MatchRound> groupByRound(List<MatchesResponseMatch> matches) {
  final byId = <String, MatchRound>{};
  for (final m in matches) {
    (byId[m.roundId] ??= MatchRound(m.roundId, m.roundLabel, m.roundSortOrder)).matches.add(m);
  }
  return byId.values.toList()..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
}

class MatchRound {
  MatchRound(this.id, this.label, this.sortOrder);
  final String id;
  final String label;
  final int sortOrder;
  final List<MatchesResponseMatch> matches = [];

  // Concluded = every match played; the final round is never treated as foldable.
  bool get allPlayed => matches.every((m) => m.status == StatusValue.finished);
  bool get isFinal => matches.any((m) => m.stage == StageValue.final_);

  /// A concluded round folds away so the list lands on what is still to come.
  bool get collapsed => allPlayed && !isFinal;
}

class _RoundGroup extends StatelessWidget {
  const _RoundGroup(this.round);
  final MatchRound round;

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      key: PageStorageKey(round.id),
      initiallyExpanded: !round.collapsed,
      title: Text(round.label, style: Theme.of(context).textTheme.titleSmall),
      childrenPadding: EdgeInsets.zero,
      children: [
        for (final m in round.matches) _MatchTile(m),
      ],
    );
  }
}

class _MatchTile extends StatelessWidget {
  const _MatchTile(this.match);
  final MatchesResponseMatch match;

  @override
  Widget build(BuildContext context) {
    final l = MaterialLocalizations.of(context);
    final k = match.kickoffTime.toLocal();
    final kickoff = '${l.formatMediumDate(k)} · ${l.formatTimeOfDay(TimeOfDay.fromDateTime(k))}';
    return MatchCard(
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeCode: match.homeTeamCode,
      awayCode: match.awayTeamCode,
      status: match.status,
      kickoffLabel: kickoff,
      homeGoals: match.fullTimeHome,
      awayGoals: match.fullTimeAway,
      locked: match.isLocked,
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => MatchDetailScreen(matchId: match.id)),
      ),
    );
  }
}
