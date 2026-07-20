import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../api/models.gen.dart';
import '../../config.dart';
import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../widgets/async_value_view.dart';
import '../widgets/reactions_bar.dart';
import '../widgets/score_pill.dart';
import '../widgets/scorers_table.dart';
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
          padding: const EdgeInsets.all(16),
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
          final tabs = _tabs(res);
          final m = res.match;
          return DefaultTabController(
            length: tabs.length,
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
                              child: Text(m.awayTeam,
                                  style: Theme.of(context).textTheme.titleLarge)),
                        ],
                      ),
                    ],
                  ),
                ),
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
