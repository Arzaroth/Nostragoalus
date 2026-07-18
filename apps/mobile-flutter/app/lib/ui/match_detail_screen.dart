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
          return ListView(
            padding: const EdgeInsets.all(16),
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
                      child: Text(m.awayTeam, style: Theme.of(context).textTheme.titleLarge)),
                ],
              ),
              const SizedBox(height: 24),
              _PredictionEditor(
                matchId: matchId,
                competitionId: m.competitionId,
                homeTeam: m.homeTeam,
                awayTeam: m.awayTeam,
                current: res.myPrediction,
                isLocked: res.isLocked,
              ),
              const SizedBox(height: 16),
              ReactionsBar(matchId: matchId),
              const SizedBox(height: 16),
              _PastPicks(matchId: matchId),
            ],
          );
        },
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
