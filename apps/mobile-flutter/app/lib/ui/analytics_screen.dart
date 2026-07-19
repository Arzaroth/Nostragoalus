import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../api/models.gen.dart';
import '../config.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';
import 'widgets/stat_tile.dart';

/// Personal prediction analytics: headline stats + bias report, round-by-round
/// accuracy, best/worst call, team bias and Fergie-time swing.
class AnalyticsScreen extends ConsumerWidget {
  const AnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final analytics = ref.watch(analyticsProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('analytics.title')),
        actions: [
          IconButton(
            icon: const Icon(Icons.share),
            tooltip: context.tr('common.share'),
            onPressed: () async {
              final comp = ref.read(selectedCompetitionProvider);
              final token = await ref.read(apiProvider).mintAnalyticsShare(competition: comp);
              await SharePlus.instance.share(ShareParams(text: '${AppConfig.webBase}/a/$token'));
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(analyticsProvider.future),
        child: AsyncValueView<AnalyticsResponse>(
          value: analytics,
          onRetry: () => ref.invalidate(analyticsProvider),
          data: (a) {
            if (!a.hasData) {
              return ListView(children: [
                const SizedBox(height: 80),
                Center(child: Text(context.tr('analytics.signInHint'))),
              ]);
            }
            return ListView(
              padding: const EdgeInsets.all(12),
              children: [
                _headline(context, a),
                _tiers(context, a.tiers),
                _goals(context, a.goals),
                _outcome(context, a.outcomeLean),
                _teamBias(context, a.teams),
                _overTime(context, a.overTime),
                _highlights(context, a),
                _fergie(context, a.fergieTime),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _headline(BuildContext context, AnalyticsResponse a) => GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        childAspectRatio: 1.8,
        children: [
          StatTile(label: context.tr('analytics.picks'), value: '${a.totalPicks.toInt()}'),
          StatTile(label: context.tr('analytics.points'), value: '${a.totalPoints.toInt()}'),
          StatTile(label: context.tr('analytics.avgPoints'), value: a.avgPoints.toStringAsFixed(1)),
          StatTile(
              label: context.tr('analytics.accuracy'), value: '${(a.accuracy * 100).round()}%'),
          StatTile(
              label: context.tr('analytics.exactRate'), value: '${(a.exactRate * 100).round()}%'),
          StatTile(
              label: context.tr('analytics.streakCurrent'),
              value: '${a.streak.current.toInt()}',
              sub: context.tr('analytics.streakBest').replaceAll('{n}', '${a.streak.best.toInt()}')),
        ],
      );

  Widget _section(BuildContext context, String title, List<Widget> children) => Card(
        margin: const EdgeInsets.only(top: 12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              ...children,
            ],
          ),
        ),
      );

  Widget _bar(BuildContext context, String label, double value, double max) {
    final frac = max <= 0 ? 0.0 : (value / max).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(width: 70, child: Text(label, style: Theme.of(context).textTheme.bodySmall)),
          Expanded(
            child: LinearProgressIndicator(
              value: frac,
              minHeight: 10,
              backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
            ),
          ),
          const SizedBox(width: 8),
          Text('${value.toInt()}', style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }

  Widget _tiers(BuildContext context, Tier t) {
    final max = [t.exact, t.diff, t.outcome, t.miss].reduce((a, b) => a > b ? a : b);
    return _section(context, context.tr('analytics.tierTitle'), [
      _bar(context, context.tr('analytics.tier.exact'), t.exact, max),
      _bar(context, context.tr('analytics.tier.diff'), t.diff, max),
      _bar(context, context.tr('analytics.tier.outcome'), t.outcome, max),
      _bar(context, context.tr('analytics.tier.miss'), t.miss, max),
    ]);
  }

  Widget _goals(BuildContext context, Goal g) => _section(context, context.tr('analytics.goalsTitle'), [
        Text(context
            .tr('analytics.goalsLine')
            .replaceAll('{predicted}', g.predictedAvg.toStringAsFixed(1))
            .replaceAll('{actual}', g.actualAvg.toStringAsFixed(1))),
      ]);

  Widget _outcome(BuildContext context, OutcomeLean o) => _section(
        context,
        context.tr('analytics.outcomeTitle'),
        [
          _bar(context, context.tr('analytics.outcome.home'), o.predicted.home,
              _maxOf(o.predicted)),
          _bar(context, context.tr('analytics.outcome.draw'), o.predicted.draw,
              _maxOf(o.predicted)),
          _bar(context, context.tr('analytics.outcome.away'), o.predicted.away,
              _maxOf(o.predicted)),
          const SizedBox(height: 6),
          if (o.homeBiasPct.abs() >= 1)
            Text(context.tr('analytics.homeBias').replaceAll('{n}', '${o.homeBiasPct.round()}')),
          if (o.drawGapPct.abs() >= 1)
            Text(context.tr('analytics.drawBlind').replaceAll('{n}', '${o.drawGapPct.round()}')),
        ],
      );

  double _maxOf(Predicted p) =>
      [p.home, p.draw, p.away].reduce((a, b) => a > b ? a : b);

  Widget _teamBias(BuildContext context, Team2 teams) {
    if (teams.overrated.isEmpty && teams.underrated.isEmpty) {
      return _section(context, context.tr('analytics.overrated'), [
        Text(context.tr('analytics.noTeamBias')),
      ]);
    }
    Widget row(Overrated t) => ListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          title: Text(t.name),
          trailing: Text('${t.delta >= 0 ? '+' : ''}${(t.delta * 100).round()}%'),
        );
    return Column(children: [
      if (teams.overrated.isNotEmpty)
        _section(context, context.tr('analytics.overrated'), teams.overrated.map(row).toList()),
      if (teams.underrated.isNotEmpty)
        _section(context, context.tr('analytics.underrated'), teams.underrated.map(row).toList()),
    ]);
  }

  Widget _overTime(BuildContext context, List<OverTime> rounds) {
    if (rounds.isEmpty) return const SizedBox.shrink();
    return _section(
      context,
      context.tr('analytics.overTimeTitle'),
      rounds.map((r) => _bar(context, r.label, (r.accuracy * 100), 100)).toList(),
    );
  }

  Widget _highlights(BuildContext context, AnalyticsResponse a) {
    Widget call(String title, BestCall? c) {
      if (c == null) return const SizedBox.shrink();
      return _section(context, title, [
        Text('${c.home} ${c.actual} ${c.away}'),
        Text(context.tr('analytics.youPicked').replaceAll('{score}', c.predicted)),
        Text('${c.points >= 0 ? '+' : ''}${c.points.toInt()} pts',
            style: Theme.of(context).textTheme.bodySmall),
      ]);
    }

    return Column(children: [
      call(context.tr('analytics.bestCall'), a.bestCall),
      call(context.tr('analytics.worstMiss'), a.worstMiss),
    ]);
  }

  Widget _fergie(BuildContext context, FergieTime f) {
    if (f.matches <= 0) return const SizedBox.shrink();
    return _section(context, context.tr('analytics.fergieTitle'), [
      Text(context
          .tr('analytics.fergieSummary')
          .replaceAll('{goals}', '${f.goals.toInt()}')
          .replaceAll('{matches}', '${f.matches.toInt()}')),
      const SizedBox(height: 4),
      Text('${context.tr('analytics.fergieWon')}: +${f.pointsWon.toInt()}  '
          '${context.tr('analytics.fergieLost')}: -${f.pointsLost.toInt()}'),
    ]);
  }
}
