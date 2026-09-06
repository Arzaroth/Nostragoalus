import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../api/models.gen.dart';
import '../config.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/panel.dart';
import 'widgets/section_card.dart';
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
            icon: const Icon(Icons.share_outlined),
            tooltip: context.tr('common.share'),
            onPressed: () => runAction(context, () async {
              final comp = ref.read(selectedCompetitionProvider);
              final token = await ref.read(apiProvider).mintAnalyticsShare(competition: comp);
              await SharePlus.instance.share(ShareParams(text: '${AppConfig.webBase}/a/$token'));
            }),
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
              return EmptyState(icon: Icons.query_stats, message: context.tr('analytics.signInHint'));
            }
            return ListView(
              padding: const EdgeInsets.only(top: 4, bottom: 24),
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

  Widget _headline(BuildContext context, AnalyticsResponse a) => Column(
        children: [
          StatBand(children: [
            StatTile(label: context.tr('analytics.picks'), value: '${a.totalPicks.toInt()}'),
            StatTile(label: context.tr('analytics.points'), value: '${a.totalPoints.toInt()}'),
            StatTile(label: context.tr('analytics.avgPoints'), value: a.avgPoints.toStringAsFixed(1)),
          ]),
          const SizedBox(height: 12),
          StatBand(children: [
            StatTile(
                label: context.tr('analytics.accuracy'),
                value: '${(a.accuracy * 100).round()}%',
                color: context.tokens.emerald),
            StatTile(
                label: context.tr('analytics.exactRate'), value: '${(a.exactRate * 100).round()}%'),
            StatTile(
                label: context.tr('analytics.streakCurrent'),
                value: '${a.streak.current.toInt()}',
                sub: context.tr('analytics.streakBest').replaceAll('{n}', '${a.streak.best.toInt()}')),
          ]),
        ],
      );

  Widget _bar(BuildContext context, String label, double value, double max, {String? display}) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final frac = max <= 0 ? 0.0 : (value / max).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          SizedBox(
            width: 76,
            child: Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(color: t.muted)),
          ),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(value: frac, minHeight: 6),
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 44,
            child: Text(display ?? '${value.toInt()}',
                textAlign: TextAlign.end, style: t.score(17, weight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  Widget _tiers(BuildContext context, Tier t) {
    final max = [t.exact, t.diff, t.outcome, t.miss].reduce((a, b) => a > b ? a : b);
    return SectionCard(title: context.tr('analytics.tierTitle'), padded: true, children: [
      _bar(context, context.tr('analytics.tier.exact'), t.exact, max),
      _bar(context, context.tr('analytics.tier.diff'), t.diff, max),
      _bar(context, context.tr('analytics.tier.outcome'), t.outcome, max),
      _bar(context, context.tr('analytics.tier.miss'), t.miss, max),
    ]);
  }

  Widget _goals(BuildContext context, Goal g) =>
      SectionCard(title: context.tr('analytics.goalsTitle'), padded: true, children: [
        Text(context
            .tr('analytics.goalsLine')
            .replaceAll('{predicted}', g.predictedAvg.toStringAsFixed(1))
            .replaceAll('{actual}', g.actualAvg.toStringAsFixed(1))),
      ]);

  Widget _outcome(BuildContext context, OutcomeLean o) {
    final theme = Theme.of(context);
    return SectionCard(
      title: context.tr('analytics.outcomeTitle'),
      padded: true,
      children: [
        _bar(context, context.tr('analytics.outcome.home'), o.predicted.home, _maxOf(o.predicted)),
        _bar(context, context.tr('analytics.outcome.draw'), o.predicted.draw, _maxOf(o.predicted)),
        _bar(context, context.tr('analytics.outcome.away'), o.predicted.away, _maxOf(o.predicted)),
        if (o.homeBiasPct.abs() >= 1 || o.drawGapPct.abs() >= 1) const SizedBox(height: 8),
        if (o.homeBiasPct.abs() >= 1)
          Text(context.tr('analytics.homeBias').replaceAll('{n}', '${o.homeBiasPct.round()}'),
              style: theme.textTheme.bodySmall),
        if (o.drawGapPct.abs() >= 1)
          Text(context.tr('analytics.drawBlind').replaceAll('{n}', '${o.drawGapPct.round()}'),
              style: theme.textTheme.bodySmall),
      ],
    );
  }

  double _maxOf(Predicted p) => [p.home, p.draw, p.away].reduce((a, b) => a > b ? a : b);

  Widget _teamBias(BuildContext context, AnalyticsResponseTeam teams) {
    if (teams.overrated.isEmpty && teams.underrated.isEmpty) {
      return SectionCard(title: context.tr('analytics.overrated'), padded: true, children: [
        Text(context.tr('analytics.noTeamBias'), style: Theme.of(context).textTheme.bodySmall),
      ]);
    }
    final t = context.tokens;
    Widget row(Overrated o) {
      final pct = (o.delta * 100).round();
      return PanelRow(
        title: Text(o.name),
        trailing: Text('${pct >= 0 ? '+' : ''}$pct%',
            style: t.score(20, color: pct >= 0 ? t.live : t.emerald)),
      );
    }

    return Column(children: [
      if (teams.overrated.isNotEmpty)
        SectionCard(title: context.tr('analytics.overrated'), children: teams.overrated.map(row).toList()),
      if (teams.underrated.isNotEmpty)
        SectionCard(title: context.tr('analytics.underrated'), children: teams.underrated.map(row).toList()),
    ]);
  }

  Widget _overTime(BuildContext context, List<OverTime> rounds) {
    if (rounds.isEmpty) return const SizedBox.shrink();
    return SectionCard(
      title: context.tr('analytics.overTimeTitle'),
      padded: true,
      children: rounds
          .map((r) => _bar(context, r.label, r.accuracy * 100, 100,
              display: '${(r.accuracy * 100).round()}%'))
          .toList(),
    );
  }

  Widget _highlights(BuildContext context, AnalyticsResponse a) {
    final theme = Theme.of(context);
    final t = context.tokens;
    Widget call(String title, BestCall? c) {
      if (c == null) return const SizedBox.shrink();
      final pts = c.points.toInt();
      return SectionCard(title: title, padded: true, children: [
        Row(
          children: [
            Expanded(
              child: Text(c.home, textAlign: TextAlign.end, style: theme.textTheme.titleSmall),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(c.actual, style: t.score(26)),
            ),
            Expanded(child: Text(c.away, style: theme.textTheme.titleSmall)),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: Text(context.tr('analytics.youPicked').replaceAll('{score}', c.predicted),
                  style: theme.textTheme.bodySmall),
            ),
            Text('${pts >= 0 ? '+' : ''}$pts',
                style: t.score(22, color: pts >= 0 ? t.emerald : t.live)),
            const SizedBox(width: 4),
            Text(context.tr('leaderboard.pts'),
                style: theme.textTheme.labelSmall?.copyWith(color: t.faint)),
          ],
        ),
      ]);
    }

    return Column(children: [
      call(context.tr('analytics.bestCall'), a.bestCall),
      call(context.tr('analytics.worstMiss'), a.worstMiss),
    ]);
  }

  Widget _fergie(BuildContext context, FergieTime f) {
    if (f.matches <= 0) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final t = context.tokens;
    return SectionCard(title: context.tr('analytics.fergieTitle'), padded: true, children: [
      Text(context
          .tr('analytics.fergieSummary')
          .replaceAll('{goals}', '${f.goals.toInt()}')
          .replaceAll('{matches}', '${f.matches.toInt()}')),
      const SizedBox(height: 10),
      Row(
        children: [
          Text('+${f.pointsWon.toInt()}', style: t.score(24, color: t.emerald)),
          const SizedBox(width: 6),
          Text(context.tr('analytics.fergieWon'),
              style: theme.textTheme.labelSmall?.copyWith(color: t.muted)),
          const SizedBox(width: 20),
          Text('-${f.pointsLost.toInt()}', style: t.score(24, color: t.live)),
          const SizedBox(width: 6),
          Text(context.tr('analytics.fergieLost'),
              style: theme.textTheme.labelSmall?.copyWith(color: t.muted)),
        ],
      ),
    ]);
  }
}
