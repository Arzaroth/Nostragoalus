import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../api/models.gen.dart';
import '../../config.dart';
import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/async_value_view.dart';
import '../widgets/reactions_bar.dart';
import '../widgets/score_pill.dart';
import '../widgets/scorers_table.dart';
import '../widgets/panel.dart';
import '../widgets/team_flag.dart';
import 'crowd_consensus.dart';
import 'past_picks.dart';
import 'prediction_editor.dart';
import 'tabs/insights_tab.dart';
import 'tabs/league_tab.dart';
import 'tabs/lineups_tab.dart';
import 'tabs/live_detail_tab.dart';
import 'tabs/media_tab.dart';
import 'tabs/timeline_tab.dart';

/// One tab: its label key and the view behind it. `TabBar`, `TabBarView` and
/// `DefaultTabController.length` are all derived from the same list so the
/// counts can never drift apart.
typedef _MatchTab = ({String labelKey, Widget view});

/// Match detail + the prediction editor. Marks itself the "viewed" match so the
/// hub keeps its room subscribed (live viewer count) and offers an OS share of
/// the match link.
class MatchDetailScreen extends ConsumerStatefulWidget {
  const MatchDetailScreen({super.key, required this.matchId});
  final String matchId;

  @override
  ConsumerState<MatchDetailScreen> createState() => _MatchDetailScreenState();
}

class _MatchDetailScreenState extends ConsumerState<MatchDetailScreen> {
  String get matchId => widget.matchId;
  // Captured while the element is alive: `ref` is unusable from dispose().
  StateController<String?>? _viewed;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final viewed = ref.read(viewedMatchProvider.notifier);
      viewed.state = matchId;
      _viewed = viewed;
    });
  }

  @override
  void dispose() {
    // The provider outlives this screen; clear it if we're still the viewer.
    final viewed = _viewed;
    if (viewed != null) {
      Future.microtask(() {
        if (viewed.mounted && viewed.state == matchId) viewed.state = null;
      });
    }
    super.dispose();
  }

  Future<void> _share(MatchDetailResponse res) async {
    final m = res.match;
    await SharePlus.instance.share(
      ShareParams(text: '${m.homeTeam} v ${m.awayTeam}\n${AppConfig.webBase}/matches/${m.id}'),
    );
  }

  List<_MatchTab> _tabs(MatchDetailResponse res) {
    final m = res.match;
    return [
      (
        labelKey: 'picks.yourPrediction',
        view: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            PredictionEditor(
              matchId: matchId,
              competitionId: m.competitionId,
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              current: res.myPrediction,
              isLocked: res.isLocked,
            ),
            const SizedBox(height: 16),
            CrowdConsensus(matchId: matchId, homeTeam: m.homeTeam, awayTeam: m.awayTeam),
            ReactionsBar(matchId: matchId),
            const SizedBox(height: 16),
            PastPicks(matchId: matchId),
          ],
        ),
      ),
      (labelKey: 'match.timeline', view: TimelineTab(matchId: matchId)),
      (labelKey: 'match.lineups', view: LineupsTab(matchId: matchId)),
      (
        labelKey: 'nav.scorers',
        view: Consumer(
          builder: (context, ref, _) => AsyncValueView<MatchScorersResponse>(
            value: ref.watch(matchScorersProvider(matchId)),
            onRetry: () => ref.invalidate(matchScorersProvider(matchId)),
            data: (res) => ScorersTable(scorers: res.scorers, assists: res.assists),
          ),
        ),
      ),
      (labelKey: 'match.insights', view: InsightsTab(matchId: matchId)),
      (labelKey: 'match.liveDetail', view: LiveDetailTab(matchId: matchId)),
      (labelKey: 'nav.leaderboard', view: LeagueTab(matchId: matchId)),
      (labelKey: 'match.media', view: MediaTab(matchId: matchId)),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(matchProvider(matchId));
    final viewers = ref.watch(viewersProvider)[matchId] ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: detail.maybeWhen(
          data: (res) => Text(res.match.roundLabel, style: Theme.of(context).textTheme.titleMedium),
          orElse: () => const SizedBox.shrink(),
        ),
        actions: [
          if (viewers > 0)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 4),
              child: Row(children: [
                Icon(Icons.visibility_outlined, size: 18, color: context.tokens.muted),
                const SizedBox(width: 4),
                Text('$viewers', style: context.tokens.score(16, weight: FontWeight.w600)),
              ]),
            ),
          IconButton(
            icon: const Icon(Icons.ios_share),
            tooltip: context.tr('common.share'),
            onPressed: () => detail.whenData(_share),
          ),
        ],
      ),
      body: AsyncValueView<MatchDetailResponse>(
        value: detail,
        onRetry: () => ref.invalidate(matchProvider(matchId)),
        data: (res) {
          final tabs = _tabs(res);
          final m = res.match;
          return DefaultTabController(
            length: tabs.length,
            child: Column(
              children: [
                _MatchHeader(match: m, locked: res.isLocked),
                TabBar(
                  isScrollable: true,
                  tabAlignment: TabAlignment.start,
                  tabs: [for (final t in tabs) Tab(text: context.tr(t.labelKey))],
                ),
                Expanded(
                  child: TabBarView(children: [for (final t in tabs) t.view]),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// The scoreboard atop the match: the two flags and names around the score
/// (or the kickoff), with the kickoff line, the shootout and the lock beneath.
class _MatchHeader extends StatelessWidget {
  const _MatchHeader({required this.match, required this.locked});
  final MatchDetailResponseMatch match;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final l = MaterialLocalizations.of(context);
    final k = match.kickoffTime.toLocal();
    final time = l.formatTimeOfDay(TimeOfDay.fromDateTime(k));
    final pens = match.penaltiesHome != null && match.penaltiesAway != null
        ? '${match.penaltiesHome} - ${match.penaltiesAway}'
        : null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _Side(name: match.homeTeam, code: match.homeTeamCode)),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
                child: Column(
                  children: [
                    ScorePill(
                      status: match.status,
                      home: match.fullTimeHome,
                      away: match.fullTimeAway,
                      size: 44,
                      kickoff: time,
                    ),
                    if (pens != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(pens,
                            style: t.score(15, weight: FontWeight.w500, color: t.muted)),
                      ),
                  ],
                ),
              ),
              Expanded(child: _Side(name: match.awayTeam, code: match.awayTeamCode)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('${l.formatMediumDate(k)} · $time',
                  style: theme.textTheme.labelMedium?.copyWith(color: t.muted)),
              if (locked) ...[
                const SizedBox(width: 10),
                Tag(context.tr('picks.locked'), icon: Icons.lock),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _Side extends StatelessWidget {
  const _Side({required this.name, required this.code});
  final String name;
  final String? code;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          TeamFlag(code, height: 44),
          const SizedBox(height: 8),
          Text(name,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleSmall),
        ],
      );
}
