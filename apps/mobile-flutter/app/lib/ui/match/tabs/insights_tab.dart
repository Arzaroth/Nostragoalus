import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/models.gen.dart';
import '../../../i18n/i18n_scope.dart';
import '../../../state/providers.dart';
import '../../../theme/app_theme.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/group_standings_table.dart';
import '../../widgets/panel.dart';
import '../../widgets/section_card.dart';
import '../../widgets/team_flag.dart';

/// Possession, head-to-head, form, next fixtures and the goal list.
class InsightsTab extends ConsumerWidget {
  const InsightsTab({super.key, required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<MatchInsightsResponse>(
      value: ref.watch(matchInsightsProvider(matchId)),
      onRetry: () => ref.invalidate(matchInsightsProvider(matchId)),
      data: (res) => ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          if (res.standings != null && res.standings!.isNotEmpty)
            GroupStandingsTable(title: context.tr('nav.standings'), rows: res.standings!),
          if (res.possession.home != null || res.possession.away != null)
            _possession(context, res.possession.home?.toInt() ?? 0, res.possession.away?.toInt() ?? 0),
          if (res.h2hAll != null) _allTime(context, res.h2hAll!),
          if (res.headToHead.isNotEmpty)
            SectionCard(title: context.tr('match.h2h'), children: [
              for (final m in res.headToHead.take(6))
                _scoreLine(context, m.homeTeam, m.awayTeam,
                    '${m.homeScore.toInt()} - ${m.awayScore.toInt()}'),
            ]),
          _form(context, res.form.home, res.form.away),
          _next(context, res.next.home, res.next.away),
          if (res.goals.isNotEmpty)
            SectionCard(title: context.tr('match.goals'), children: [
              for (final g in res.goals)
                _minuteRow(
                    context,
                    g.minute,
                    '${g.playerName}'
                    '${g.ownGoal ? ' (${context.tr('match.ownGoalShort')})' : ''}'),
            ]),
        ],
      ),
    );
  }

  Widget _possession(BuildContext context, int home, int away) {
    final t = context.tokens;
    final total = home + away;
    return SectionCard(title: context.tr('match.possession'), padded: true, children: [
      Row(
        children: [
          Text('$home%', style: t.score(24)),
          const SizedBox(width: 12),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(value: total > 0 ? home / total : 0.5, minHeight: 6),
            ),
          ),
          const SizedBox(width: 12),
          Text('$away%', style: t.score(24)),
        ],
      ),
    ]);
  }

  Widget _allTime(BuildContext context, H2hAll h) {
    final theme = Theme.of(context);
    final t = context.tokens;
    Widget cell(int n, String letter, {Color? color}) => Expanded(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('$n', style: t.score(24, color: color)),
              const SizedBox(width: 3),
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(letter, style: theme.textTheme.labelSmall?.copyWith(color: t.muted)),
              ),
            ],
          ),
        );
    return SectionCard(title: context.tr('match.allTime'), padded: true, children: [
      Row(
        children: [
          cell(h.wins.toInt(), 'W', color: t.emerald),
          cell(h.draws.toInt(), 'D'),
          cell(h.losses.toInt(), 'L', color: t.live),
          Expanded(
            child: Text('${h.goalsFor.toInt()} - ${h.goalsAgainst.toInt()}',
                textAlign: TextAlign.center, style: t.score(24, color: t.muted)),
          ),
        ],
      ),
    ]);
  }

  /// A row with a team on each side of a scoreboard number.
  Widget _scoreLine(BuildContext context, String home, String away, String score) {
    final theme = Theme.of(context);
    final t = context.tokens;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(home,
                textAlign: TextAlign.end,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(score, style: t.score(20)),
          ),
          Expanded(
            child: Text(away, maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodyMedium),
          ),
        ],
      ),
    );
  }

  Widget _minuteRow(BuildContext context, String? minute, String label) {
    final t = context.tokens;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          SizedBox(
            width: 44,
            child: Text(minute == null || minute.isEmpty ? '' : "$minute'",
                style: t.score(17, weight: FontWeight.w600, color: t.muted)),
          ),
          Expanded(child: Text(label)),
        ],
      ),
    );
  }

  Widget _formRow(BuildContext context, List<MatchInsightsResponseFormHome> form) {
    final t = context.tokens;
    return Wrap(
      spacing: 6,
      children: [
        for (final f in form)
          Tag(
            f.result.wire,
            color: switch (f.result) {
              ResultValue.w => t.emerald,
              ResultValue.l => t.live,
              _ => t.muted,
            },
          ),
      ],
    );
  }

  Widget _form(
    BuildContext context,
    List<MatchInsightsResponseFormHome> home,
    List<MatchInsightsResponseFormHome> away,
  ) {
    if (home.isEmpty && away.isEmpty) return const SizedBox.shrink();
    return SectionCard(title: context.tr('match.form'), padded: true, children: [
      if (home.isNotEmpty) _formRow(context, home),
      if (away.isNotEmpty) ...[const SizedBox(height: 8), _formRow(context, away)],
    ]);
  }

  Widget _next(BuildContext context, List<NextHome> home, List<NextHome> away) {
    final all = [...home, ...away];
    if (all.isEmpty) return const SizedBox.shrink();
    return SectionCard(title: context.tr('match.next'), children: [
      for (final n in all)
        PanelRow(
          leading: TeamFlag(n.opponentCode, height: 18),
          title: Text(n.opponent),
          trailing: Text(n.kickoffTime),
        ),
    ]);
  }
}
