import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../api/models.gen.dart';
import '../config.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';
import 'widgets/reactions_bar.dart';
import 'widgets/score_pill.dart';
import 'widgets/scorers_table.dart';

/// Match detail + the prediction editor (score, outcome-only, wager, joker).
/// Marks itself the "viewed" match so the hub keeps its room subscribed (live
/// viewer count) and offers an OS share of the match link.
class MatchDetailScreen extends ConsumerStatefulWidget {
  const MatchDetailScreen({super.key, required this.matchId});
  final String matchId;

  @override
  ConsumerState<MatchDetailScreen> createState() => _MatchDetailScreenState();
}

class _MatchDetailScreenState extends ConsumerState<MatchDetailScreen> {
  String get matchId => widget.matchId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(viewedMatchProvider.notifier).state = matchId;
    });
  }

  @override
  void dispose() {
    // The provider outlives this screen; clear it if we're still the viewer.
    Future.microtask(() {
      final notifier = ref.read(viewedMatchProvider.notifier);
      if (notifier.state == matchId) notifier.state = null;
    });
    super.dispose();
  }

  void _share(MatchDetailResponse res) {
    final m = res.match;
    final base = AppConfig.apiBase.replaceFirst('http://10.0.2.2:3000', 'https://goal.arzaroth.com');
    SharePlus.instance.share(ShareParams(text: '${m.homeTeam} v ${m.awayTeam}\n$base/matches/${m.id}'));
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(matchProvider(matchId));
    final viewers = ref.watch(viewersProvider)[matchId] ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('nav.matches')),
        actions: [
          if (viewers > 0)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Row(children: [
                const Icon(Icons.visibility, size: 18),
                const SizedBox(width: 4),
                Center(child: Text('$viewers')),
                const SizedBox(width: 8),
              ]),
            ),
          IconButton(
            icon: const Icon(Icons.share),
            onPressed: () => detail.whenData(_share),
          ),
        ],
      ),
      body: AsyncValueView<MatchDetailResponse>(
        value: detail,
        onRetry: () => ref.invalidate(matchProvider(matchId)),
        data: (res) {
          final m = res.match;
          return DefaultTabController(
            length: 7,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Column(
                    children: [
                      Text(m.roundLabel, style: Theme.of(context).textTheme.labelMedium),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                              child: Text(m.homeTeam,
                                  style: Theme.of(context).textTheme.titleLarge,
                                  textAlign: TextAlign.end)),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: ScorePill(
                                status: m.status, home: m.fullTimeHome, away: m.fullTimeAway),
                          ),
                          Expanded(
                              child:
                                  Text(m.awayTeam, style: Theme.of(context).textTheme.titleLarge)),
                        ],
                      ),
                    ],
                  ),
                ),
                TabBar(
                  isScrollable: true,
                  tabAlignment: TabAlignment.start,
                  tabs: [
                    Tab(text: context.tr('picks.yourPrediction')),
                    Tab(text: context.tr('match.timeline')),
                    Tab(text: context.tr('match.lineups')),
                    Tab(text: context.tr('nav.standings')),
                    Tab(text: context.tr('match.insights')),
                    Tab(text: context.tr('match.liveDetail')),
                    Tab(text: context.tr('nav.leaderboard')),
                    Tab(text: context.tr('match.media')),
                  ],
                ),
                Expanded(
                  child: TabBarView(
                    children: [
                      ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          _PredictionEditor(
                            matchId: matchId,
                            competitionId: m.competitionId,
                            homeTeam: m.homeTeam,
                            awayTeam: m.awayTeam,
                            current: res.myPrediction,
                            isLocked: res.isLocked,
                          ),
                          const SizedBox(height: 16),
                          _CrowdConsensus(matchId: matchId, homeTeam: m.homeTeam, awayTeam: m.awayTeam),
                          ReactionsBar(matchId: matchId),
                          const SizedBox(height: 16),
                          _PastPicks(matchId: matchId),
                        ],
                      ),
                      _TimelineTab(matchId: matchId),
                      _LineupsTab(matchId: matchId),
                      _ScorersTab(matchId: matchId),
                      _InsightsTab(matchId: matchId),
                      _LiveDetailTab(matchId: matchId),
                      _LeagueTab(matchId: matchId),
                      _MediaTab(matchId: matchId),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TimelineTab extends ConsumerWidget {
  const _TimelineTab({required this.matchId});
  final String matchId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<MatchTimelineResponse>(
      value: ref.watch(matchTimelineProvider(matchId)),
      onRetry: () => ref.invalidate(matchTimelineProvider(matchId)),
      data: (res) {
        final entries = res.events.entries.toList();
        if (entries.isEmpty) return Center(child: Text(context.tr('match.noEvents')));
        return ListView(
          children: [
            for (final e in entries)
              ListTile(dense: true, leading: Text(e.key), title: Text('${e.value}')),
          ],
        );
      },
    );
  }
}

class _LineupsTab extends ConsumerWidget {
  const _LineupsTab({required this.matchId});
  final String matchId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<MatchLineupsResponse>(
      value: ref.watch(matchLineupsProvider(matchId)),
      onRetry: () => ref.invalidate(matchLineupsProvider(matchId)),
      data: (res) {
        final l = res.lineups;
        if (l == null || !l.available) return Center(child: Text(context.tr('match.noLineups')));
        return ListView(
          children: [
            _side(context, l.home),
            _side(context, l.away),
          ],
        );
      },
    );
  }

  Widget _side(BuildContext context, Home side) => Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(side.formation ?? '', style: Theme.of(context).textTheme.titleMedium),
            for (final p in side.startingXI)
              ListTile(
                dense: true,
                leading: Text(p.shirtNumber?.toInt().toString() ?? ''),
                title: Text(p.name),
                subtitle: p.position != null ? Text(p.position!) : null,
                trailing: p.captain ? const Text('C') : null,
              ),
          ],
        ),
      );
}

class _ScorersTab extends ConsumerWidget {
  const _ScorersTab({required this.matchId});
  final String matchId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<ScorersResponse>(
      value: ref.watch(matchScorersProvider(matchId)),
      onRetry: () => ref.invalidate(matchScorersProvider(matchId)),
      data: (res) => ScorersTable(scorers: res.scorers, assists: res.assists),
    );
  }
}

class _InsightsTab extends ConsumerWidget {
  const _InsightsTab({required this.matchId});
  final String matchId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<MatchInsightsResponse>(
      value: ref.watch(matchInsightsProvider(matchId)),
      onRetry: () => ref.invalidate(matchInsightsProvider(matchId)),
      data: (res) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            title: Text(context.tr('h2h.title')),
            trailing: Text('${res.headToHead.length}'),
          ),
          ListTile(
            title: Text(context.tr('match.possession')),
            trailing: Text('${res.possession.home?.toInt() ?? 0}% - ${res.possession.away?.toInt() ?? 0}%'),
          ),
        ],
      ),
    );
  }
}

/// Upstream live match detail (opaque provider blob): venue, attendance, cards,
/// per-team stats, goals, bookings and subs. Renders only what the feed exposes.
class _LiveDetailTab extends ConsumerWidget {
  const _LiveDetailTab({required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<Map<String, dynamic>?>(
      value: ref.watch(matchLiveDetailProvider(matchId)),
      onRetry: () => ref.invalidate(matchLiveDetailProvider(matchId)),
      data: (d) {
        if (d == null || d.isEmpty) {
          return Center(child: Text(context.tr('match.noLiveDetail')));
        }
        final stats = d['stats'] as Map?;
        final goals = (d['goals'] as List?) ?? const [];
        final bookings = (d['bookings'] as List?) ?? const [];
        final subs = (d['substitutions'] as List?) ?? const [];
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (d['stadium'] != null)
              ListTile(
                dense: true,
                leading: const Icon(Icons.stadium),
                title: Text(d['stadium'].toString()),
                subtitle: d['attendance'] != null ? Text('${d['attendance']}') : null,
              ),
            _cards(context, d['cards'] as Map?),
            _statsBlock(context, stats),
            _eventList(context, context.tr('match.goals'), goals,
                (g) => '${_min(g)} ${_str(g, 'scorer') ?? _str(g, 'player') ?? ''}'.trim()),
            _eventList(context, context.tr('match.bookings'), bookings,
                (b) => '${_min(b)} ${_str(b, 'player') ?? ''} (${_str(b, 'card') ?? _str(b, 'type') ?? ''})'.trim()),
            _eventList(context, context.tr('match.subs'), subs,
                (s) => '${_min(s)} ${_str(s, 'playerOut') ?? ''} → ${_str(s, 'playerIn') ?? ''}'.trim()),
          ],
        );
      },
    );
  }

  String _min(dynamic e) {
    final m = e is Map ? (e['minute'] ?? e['time']) : null;
    return m == null ? '' : "$m'";
  }

  String? _str(dynamic e, String k) {
    if (e is! Map) return null;
    return e[k]?.toString();
  }

  Widget _cards(BuildContext context, Map? cards) {
    if (cards == null) return const SizedBox.shrink();
    final h = cards['home'] as Map?;
    final a = cards['away'] as Map?;
    if (h == null && a == null) return const SizedBox.shrink();
    return ListTile(
      dense: true,
      leading: const Icon(Icons.style),
      title: Text(context.tr('match.bookings')),
      trailing: Text('🟨 ${h?['yellow'] ?? 0}-${a?['yellow'] ?? 0}   '
          '🟥 ${h?['red'] ?? 0}-${a?['red'] ?? 0}'),
    );
  }

  Widget _statsBlock(BuildContext context, Map? stats) {
    if (stats == null) return const SizedBox.shrink();
    final h = (stats['home'] as Map?)?.cast<String, dynamic>();
    final a = (stats['away'] as Map?)?.cast<String, dynamic>();
    if (h == null && a == null) return const SizedBox.shrink();
    final keys = {...?h?.keys, ...?a?.keys}.toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.tr('match.stats'), style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 6),
            for (final k in keys)
              Row(
                children: [
                  SizedBox(width: 40, child: Text('${h?[k] ?? '-'}', textAlign: TextAlign.start)),
                  Expanded(child: Text(k, textAlign: TextAlign.center)),
                  SizedBox(width: 40, child: Text('${a?[k] ?? '-'}', textAlign: TextAlign.end)),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _eventList(
      BuildContext context, String title, List items, String Function(dynamic) label) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleSmall),
            for (final e in items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Text(label(e)),
              ),
          ],
        ),
      ),
    );
  }
}

/// Crowd consensus for one match, shown under the prediction input when the
/// show-crowd preference is on. Silent when off, loading, or no picks yet.
class _CrowdConsensus extends ConsumerWidget {
  const _CrowdConsensus({required this.matchId, required this.homeTeam, required this.awayTeam});
  final String matchId;
  final String homeTeam;
  final String awayTeam;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final showCrowd = ref.watch(authControllerProvider).valueOrNull?.showCrowd ?? false;
    if (!showCrowd) return const SizedBox.shrink();
    final totals = ref.watch(crowdTotalsProvider).valueOrNull;
    final t = totals?[matchId];
    if (t is! Map) return const SizedBox.shrink();
    final home = (t['home'] as num?)?.toInt() ?? 0;
    final away = (t['away'] as num?)?.toInt() ?? 0;
    final count = (t['count'] as num?)?.toInt() ?? 0;
    if (count == 0) return const SizedBox.shrink();
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.tr('crowd.title'), style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Expanded(child: Text(homeTeam, textAlign: TextAlign.end)),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Text('$home - $away',
                      style: Theme.of(context).textTheme.titleLarge),
                ),
                Expanded(child: Text(awayTeam)),
              ],
            ),
            const SizedBox(height: 4),
            Center(
              child: Text(context.tr('crowd.count').replaceAll('{n}', '$count'),
                  style: Theme.of(context).textTheme.bodySmall),
            ),
          ],
        ),
      ),
    );
  }
}

class _LeagueTab extends ConsumerWidget {
  const _LeagueTab({required this.matchId});
  final String matchId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<MatchLeagueStandingsResponse>(
      value: ref.watch(matchLeagueStandingsProvider(matchId)),
      onRetry: () => ref.invalidate(matchLeagueStandingsProvider(matchId)),
      data: (res) => res.rows.isEmpty
          ? Center(child: Text(context.tr('leaderboard.empty')))
          : ListView(
              children: [
                for (final r in res.rows)
                  ListTile(
                    dense: true,
                    leading: Text('${r.rank.toInt()}'),
                    title: Text(r.displayName),
                    subtitle: Text('${r.homeGoals.toInt()}-${r.awayGoals.toInt()}'),
                    trailing: Text('${r.points.toInt()}'),
                  ),
              ],
            ),
    );
  }
}

class _MediaTab extends ConsumerWidget {
  const _MediaTab({required this.matchId});
  final String matchId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<MatchMediaResponse>(
      value: ref.watch(matchMediaProvider(matchId)),
      onRetry: () => ref.invalidate(matchMediaProvider(matchId)),
      data: (res) => res.media.isEmpty
          ? Center(child: Text(context.tr('match.noMedia')))
          : ListView(
              children: [
                for (final m in res.media)
                  ListTile(
                    leading: Icon(switch (m.kind) {
                      'LIVE' => Icons.live_tv,
                      'HIGHLIGHTS' => Icons.movie,
                      _ => Icons.replay,
                    }),
                    title: Text(m.label ?? m.kind),
                    subtitle: Text(m.url, maxLines: 1, overflow: TextOverflow.ellipsis),
                    trailing: const Icon(Icons.open_in_new, size: 18),
                    onTap: () => SharePlus.instance.share(ShareParams(text: m.url)),
                  ),
              ],
            ),
    );
  }
}

class _PredictionEditor extends ConsumerStatefulWidget {
  const _PredictionEditor({
    required this.matchId,
    required this.competitionId,
    required this.homeTeam,
    required this.awayTeam,
    required this.current,
    required this.isLocked,
  });

  final String matchId;
  final String competitionId;
  final String homeTeam;
  final String awayTeam;
  final MyPrediction? current;
  final bool isLocked;

  @override
  ConsumerState<_PredictionEditor> createState() => _PredictionEditorState();
}

class _PredictionEditorState extends ConsumerState<_PredictionEditor> {
  late int _home = widget.current?.homeGoals ?? 0;
  late int _away = widget.current?.awayGoals ?? 0;
  late bool _outcomeOnly = widget.current?.isOutcomeOnly ?? false;
  bool _saving = false;

  League2? _leagueFor(List<League2> leagues) {
    for (final l in leagues) {
      if (l.competition.id == widget.competitionId) return l;
    }
    return leagues.isEmpty ? null : leagues.first;
  }

  Future<void> _save(League2 league) async {
    setState(() => _saving = true);
    try {
      await ref.read(apiProvider).savePrediction(
            league.id,
            widget.matchId,
            PredictionInput(home: _home, away: _away, isOutcomeOnly: _outcomeOnly),
          );
      ref.invalidate(matchProvider(widget.matchId));
      ref.invalidate(leaderboardProvider);
      if (mounted) _toast(context.tr('picks.saved'));
    } catch (_) {
      if (mounted) _toast(context.tr('err.generic'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggleJoker(League2 league) async {
    final next = !(widget.current?.isJoker ?? false);
    try {
      await ref.read(apiProvider).setJoker(league.id, widget.matchId, next);
      ref.invalidate(matchProvider(widget.matchId));
      ref.invalidate(leaguesProvider);
    } catch (_) {
      if (mounted) _toast(context.tr('err.generic'));
    }
  }

  void _toast(String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  @override
  Widget build(BuildContext context) {
    if (widget.isLocked) {
      return Card(
        child: ListTile(
          leading: const Icon(Icons.lock),
          title: Text(context.tr('picks.locked')),
          subtitle: widget.current != null
              ? Text('${widget.current!.homeGoals} - ${widget.current!.awayGoals}')
              : null,
        ),
      );
    }

    final leagues = ref.watch(leaguesProvider);
    return leagues.when(
      loading: () => const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
      error: (_, __) => Text(context.tr('err.generic')),
      data: (res) {
        final league = _leagueFor(res.leagues);
        if (league == null) {
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(context.tr('leagues.emptyHint')),
            ),
          );
        }
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(context.tr('picks.yourPrediction'),
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _Stepper(
                        label: widget.homeTeam,
                        value: _home,
                        onChanged: (v) => setState(() => _home = v)),
                    const Text('-', style: TextStyle(fontSize: 24)),
                    _Stepper(
                        label: widget.awayTeam,
                        value: _away,
                        onChanged: (v) => setState(() => _away = v)),
                  ],
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(context.tr('picks.outcomeOnly')),
                  value: _outcomeOnly,
                  onChanged: (v) => setState(() => _outcomeOnly = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(context.tr('picks.joker')),
                  value: widget.current?.isJoker ?? false,
                  onChanged: (_) => _toggleJoker(league),
                ),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: _saving ? null : () => _save(league),
                  icon: _saving
                      ? const SizedBox(
                          height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.save),
                  label: Text(context.tr('picks.save')),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// The "counterfactual" - how an earlier prediction would have scored vs the one
/// the user kept. Only shown once there's a live/final scope to compare against.
class _PastPicks extends ConsumerWidget {
  const _PastPicks({required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(pastPicksProvider(matchId)).maybeWhen(
          data: (res) {
            if (res.scope == 'none' || res.earlier == null) return const SizedBox.shrink();
            final earlier = res.earlier!;
            final kept = res.kept;
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(context.tr('pastPick.title'),
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    Text(context.tr('pastPick.earlier', {
                      'score': '${earlier.home.toInt()}-${earlier.away.toInt()}',
                      'n': earlier.points.toInt(),
                    })),
                    if (kept != null)
                      Text(context.tr('pastPick.kept', {
                        'score': '${kept.home.toInt()}-${kept.away.toInt()}',
                        'n': kept.points.toInt(),
                      })),
                  ],
                ),
              ),
            );
          },
          orElse: () => const SizedBox.shrink(),
        );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.label, required this.value, required this.onChanged});
  final String label;
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          SizedBox(width: 90, child: Text(label, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis)),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                onPressed: value > 0 ? () => onChanged(value - 1) : null,
                icon: const Icon(Icons.remove_circle_outline),
              ),
              Text('$value', style: Theme.of(context).textTheme.headlineSmall),
              IconButton(
                onPressed: value < 20 ? () => onChanged(value + 1) : null,
                icon: const Icon(Icons.add_circle_outline),
              ),
            ],
          ),
        ],
      );
}
