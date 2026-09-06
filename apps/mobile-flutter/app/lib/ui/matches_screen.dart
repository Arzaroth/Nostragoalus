import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'best_scorer_screen.dart';
import 'champion_screen.dart';
import 'competition_switcher.dart';
import 'match_detail_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/match_card.dart';
import 'widgets/notifications_bell.dart';
import 'widgets/panel.dart';
import 'widgets/score_pill.dart';
import 'widgets/stat_tile.dart';
import 'widgets/team_flag.dart';

/// Fixtures list, grouped by round. A round whose matches have all been played
/// starts collapsed (the final is never folded), so the list lands on what is
/// still to come. Tap a match to open its detail + make a prediction.
class MatchesScreen extends ConsumerWidget {
  const MatchesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matches = ref.watch(matchesProvider);
    final active = ref.watch(matchFilterProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('matches.title')),
        actions: const [CompetitionSwitcher(), NotificationsBell()],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(matchesProvider.future),
        child: AsyncValueView<MatchesResponse>(
          value: matches,
          onRetry: () => ref.invalidate(matchesProvider),
          data: (res) {
            if (res.matches.isEmpty) {
              return EmptyState(icon: Icons.sports_soccer, message: context.tr('matches.empty'));
            }
            final shown = res.matches.where((m) => active.contains(_filterOf(m.status))).toList();
            final rounds = groupByRound(shown);
            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                const _StatHeader(),
                const _PicksSection(),
                const _FilterBar(),
                if (rounds.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 48),
                    child: Center(
                      child: Text(context.tr('matches.noResults'),
                          style: TextStyle(color: context.tokens.muted)),
                    ),
                  ),
                for (final r in rounds) _RoundGroup(r),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Which status bucket a match falls in, for the fixtures filter chips.
enum MatchFilter { full, live, upcoming }

MatchFilter _filterOf(StatusValue s) => switch (s) {
      StatusValue.finished || StatusValue.awarded => MatchFilter.full,
      StatusValue.live || StatusValue.paused => MatchFilter.live,
      _ => MatchFilter.upcoming,
    };

/// The active fixtures filters (all on by default). A chip toggles its bucket;
/// clearing the last one is disallowed so the list never goes blank by accident.
final matchFilterProvider = StateProvider.autoDispose<Set<MatchFilter>>(
    (ref) => {MatchFilter.full, MatchFilter.live, MatchFilter.upcoming});

class _FilterBar extends ConsumerWidget {
  const _FilterBar();

  static const _labelKeys = {
    MatchFilter.full: 'matches.filterStatus.fulltime',
    MatchFilter.live: 'matches.filterStatus.live',
    MatchFilter.upcoming: 'matches.filterStatus.upcoming',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = ref.watch(matchFilterProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Row(
        children: [
          for (final f in MatchFilter.values)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 8),
              child: FilterChip(
                label: Text(context.tr(_labelKeys[f]!)),
                avatar: f == MatchFilter.live && active.contains(f) ? const LiveDot() : null,
                selected: active.contains(f),
                onSelected: (on) {
                  final next = {...active};
                  if (on) {
                    next.add(f);
                  } else if (next.length > 1) {
                    next.remove(f);
                  }
                  ref.read(matchFilterProvider.notifier).state = next;
                },
              ),
            ),
        ],
      ),
    );
  }
}

/// The player's standing, read off the leaderboard the leaderboard tab already
/// fetches: one scoreboard strip of Points / Rank / Exact. Renders nothing
/// until it resolves, so it never delays or blocks the fixtures.
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
      padding: const EdgeInsets.only(top: 4),
      child: StatBand(
        children: [
          StatTile(label: context.tr('picks.points'), value: '${mine.totalPoints.toInt()}'),
          StatTile(
            label: context.tr('picks.rank', {'n': '${board.rows.length}'}),
            value: '${mine.rank.toInt()}',
          ),
          StatTile(
            label: context.tr('picks.exact'),
            value: '${mine.exactCount.toInt()}',
            color: mine.exactCount > 0 ? context.tokens.emerald : null,
          ),
        ],
      ),
    );
  }
}

/// The champion + best-scorer season picks: two rows on one panel, each with
/// the current pick (or the prompt) that opens its full screen. Renders nothing
/// until both resolve, so it never blocks the fixtures.
class _PicksSection extends ConsumerWidget {
  const _PicksSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final champion = ref.watch(championProvider).valueOrNull;
    final scorer = ref.watch(bestScorerProvider).valueOrNull;
    if (champion == null || scorer == null) return const SizedBox.shrink();

    final cp = champion.myPick;
    final sp = scorer.myPick;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Panel(
        children: [
          _PickRow(
            icon: Icons.emoji_events_outlined,
            title: context.tr('champion.title'),
            pick: cp == null ? null : _Pick(code: cp.teamCode, label: cp.teamName),
            ctaKey: champion.locked ? 'champion.noPick' : 'champion.pick',
            locked: champion.locked,
            onTap: () => Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const ChampionScreen())),
          ),
          _PickRow(
            icon: Icons.sports_soccer_outlined,
            title: context.tr('bestScorer.title'),
            pick: sp == null ? null : _Pick(code: sp.teamCode, label: sp.playerName),
            ctaKey: scorer.locked ? 'bestScorer.noPick' : 'bestScorer.pickPlayer',
            locked: scorer.locked,
            onTap: () => Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const BestScorerScreen())),
          ),
        ],
      ),
    );
  }
}

class _Pick {
  const _Pick({required this.code, required this.label});
  final String? code;
  final String label;
}

class _PickRow extends StatelessWidget {
  const _PickRow({
    required this.icon,
    required this.title,
    required this.pick,
    required this.ctaKey,
    required this.locked,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final _Pick? pick;
  final String ctaKey;
  final bool locked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final t = context.tokens;
    final p = pick;
    return PanelRow(
      onTap: onTap,
      chevron: true,
      leading: Icon(icon, color: p == null && !locked ? scheme.primary : t.amber),
      title: Text(title),
      subtitle: p == null
          ? Text(context.tr(ctaKey),
              style: theme.textTheme.labelMedium?.copyWith(
                  color: locked ? t.faint : scheme.primary, fontWeight: FontWeight.w600))
          : null,
      trailing: p != null
          ? Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (p.code != null) ...[
                  TeamFlag(p.code, height: 18),
                  const SizedBox(width: 8),
                ],
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 150),
                  child: Text(p.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall),
                ),
              ],
            )
          : null,
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
    final theme = Theme.of(context);
    final t = context.tokens;
    final liveCount = round.matches.where((m) => ScorePill.isLive(m.status)).length;
    return ExpansionTile(
      key: PageStorageKey(round.id),
      initiallyExpanded: !round.collapsed,
      tilePadding: const EdgeInsets.fromLTRB(20, 8, 16, 0),
      title: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Flexible(
            child: Text(round.label,
                style: theme.textTheme.headlineSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: 10),
          if (liveCount > 0) ...[
            const Padding(padding: EdgeInsets.only(bottom: 6), child: LiveDot(size: 7)),
            const SizedBox(width: 5),
          ],
          Padding(
            padding: const EdgeInsets.only(bottom: 2),
            child: Text('${round.matches.length}',
                style: theme.textTheme.labelMedium?.copyWith(color: t.muted)),
          ),
        ],
      ),
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 4),
          child: Panel(children: [for (final m in round.matches) _MatchTile(m)]),
        ),
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
    final time = l.formatTimeOfDay(TimeOfDay.fromDateTime(k));
    return MatchCard(
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeCode: match.homeTeamCode,
      awayCode: match.awayTeamCode,
      status: match.status,
      kickoffLabel: '${l.formatMediumDate(k)} · $time',
      kickoffTime: time,
      homeGoals: match.fullTimeHome,
      awayGoals: match.fullTimeAway,
      locked: match.isLocked,
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => MatchDetailScreen(matchId: match.id)),
      ),
    );
  }
}
