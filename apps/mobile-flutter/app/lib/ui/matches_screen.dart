import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'best_scorer_screen.dart';
import 'champion_screen.dart';
import 'competition_switcher.dart';
import 'match_detail_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/match_card.dart';
import 'widgets/notifications_bell.dart';
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
        title: Text(context.tr('nav.matches')),
        actions: const [CompetitionSwitcher(), NotificationsBell()],
      ),
      body: Column(
        children: [
          const _FilterBar(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.refresh(matchesProvider.future),
              child: AsyncValueView<MatchesResponse>(
                value: matches,
                onRetry: () => ref.invalidate(matchesProvider),
                data: (res) {
                  if (res.matches.isEmpty) {
                    return EmptyState(message: context.tr('matches.empty'));
                  }
                  final shown =
                      res.matches.where((m) => active.contains(_filterOf(m.status))).toList();
                  final rounds = groupByRound(shown);
                  return ListView(
                    children: [
                      const _StatHeader(),
                      const _PicksSection(),
                      if (rounds.isEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 48),
                          child: Center(child: Text(context.tr('matches.noResults'))),
                        ),
                      for (final r in rounds) _RoundGroup(r),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
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
    MatchFilter.full: 'match.statusLabel.fullTime',
    MatchFilter.live: 'match.statusLabel.live',
    MatchFilter.upcoming: 'match.statusLabel.scheduled',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = ref.watch(matchFilterProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
      child: Row(
        children: [
          for (final f in MatchFilter.values)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                label: Text(context.tr(_labelKeys[f]!)),
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

/// The champion + best-scorer season picks, as the web shows them at the top of
/// the fixtures page: each a card with the current pick (or a prompt) that opens
/// its full screen. Renders nothing until both resolve, so it never blocks the
/// fixtures.
class _PicksSection extends ConsumerWidget {
  const _PicksSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final champion = ref.watch(championProvider).valueOrNull;
    final scorer = ref.watch(bestScorerProvider).valueOrNull;
    if (champion == null || scorer == null) return const SizedBox.shrink();

    final cp = champion.myPick;
    final sp = scorer.myPick;
    return Column(
      children: [
        _PickCard(
          icon: Icons.emoji_events,
          title: context.tr('champion.title'),
          hint: context.tr('champion.hint'),
          pick: cp == null
              ? null
              : _Pick(code: cp.teamCode, label: cp.teamName),
          ctaKey: champion.locked ? 'champion.noPick' : 'champion.pick',
          onTap: () =>
              Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ChampionScreen())),
        ),
        _PickCard(
          icon: Icons.sports_soccer,
          title: context.tr('bestScorer.title'),
          hint: context.tr('bestScorer.hint'),
          pick: sp == null
              ? null
              : _Pick(code: sp.teamCode, label: sp.playerName),
          ctaKey: scorer.locked ? 'bestScorer.noPick' : 'bestScorer.pickPlayer',
          onTap: () => Navigator.of(context)
              .push(MaterialPageRoute(builder: (_) => const BestScorerScreen())),
        ),
      ],
    );
  }
}

class _Pick {
  const _Pick({required this.code, required this.label});
  final String? code;
  final String label;
}

class _PickCard extends StatelessWidget {
  const _PickCard({
    required this.icon,
    required this.title,
    required this.hint,
    required this.pick,
    required this.ctaKey,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String hint;
  final _Pick? pick;
  final String ctaKey;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(icon, size: 20, color: scheme.tertiary),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: theme.textTheme.titleSmall),
                    const SizedBox(height: 3),
                    Text(hint,
                        style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                    const SizedBox(height: 6),
                    if (pick != null)
                      Row(
                        children: [
                          if (pick!.code != null) ...[
                            TeamFlag(pick!.code, height: 18),
                            const SizedBox(width: 8),
                          ],
                          Flexible(
                            child: Text(pick!.label,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodyMedium
                                    ?.copyWith(fontWeight: FontWeight.w600)),
                          ),
                        ],
                      )
                    else
                      Text(context.tr(ctaKey),
                          style: theme.textTheme.bodyMedium?.copyWith(
                              color: ctaKey.endsWith('noPick') ? scheme.onSurfaceVariant : scheme.primary,
                              fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, size: 18, color: scheme.outline),
            ],
          ),
        ),
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
