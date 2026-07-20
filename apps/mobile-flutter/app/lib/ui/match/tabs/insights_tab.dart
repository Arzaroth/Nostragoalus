import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/models.gen.dart';
import '../../../i18n/i18n_scope.dart';
import '../../../state/providers.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/section_card.dart';

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
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          if (res.standings != null && res.standings!.isNotEmpty)
            SectionCard(title: context.tr('nav.standings'), children: [
              for (final r in res.standings!)
                Row(
                  children: [
                    Expanded(child: Text(r.name)),
                    Text('${r.played.toInt()}  '
                        '${r.gd.toInt() >= 0 ? '+' : ''}${r.gd.toInt()}  '
                        '${r.points.toInt()}'),
                  ],
                ),
            ]),
          if (res.possession.home != null || res.possession.away != null)
            SectionCard(title: context.tr('match.possession'), children: [
              Text('${res.possession.home?.toInt() ?? 0}% - ${res.possession.away?.toInt() ?? 0}%'),
            ]),
          if (res.h2hAll != null)
            SectionCard(title: context.tr('match.allTime'), children: [
              Text('${res.h2hAll!.wins.toInt()}W ${res.h2hAll!.draws.toInt()}D '
                  '${res.h2hAll!.losses.toInt()}L  ·  '
                  '${res.h2hAll!.goalsFor.toInt()}-${res.h2hAll!.goalsAgainst.toInt()}'),
            ]),
          if (res.headToHead.isNotEmpty)
            SectionCard(title: context.tr('match.h2h'), children: [
              for (final m in res.headToHead.take(6))
                Text('${m.homeTeam} ${m.homeScore.toInt()}-${m.awayScore.toInt()} ${m.awayTeam}'),
            ]),
          _form(context, res.form.home, res.form.away),
          _next(context, res.next.home, res.next.away),
          if (res.goals.isNotEmpty)
            SectionCard(title: context.tr('match.goals'), children: [
              for (final g in res.goals)
                Text('${g.minute ?? ''} ${g.playerName}'
                        '${g.ownGoal ? ' (${context.tr('match.ownGoalShort')})' : ''}'
                    .trim()),
            ]),
        ],
      ),
    );
  }

  Widget _formRow(BuildContext context, List<MatchInsightsResponseFormHome> form) => Wrap(
        spacing: 4,
        children: [
          for (final f in form)
            CircleAvatar(
              radius: 11,
              backgroundColor: switch (f.result) {
                'W' => Colors.green,
                'L' => Theme.of(context).colorScheme.error,
                _ => Colors.grey,
              },
              child: Text(f.result, style: const TextStyle(fontSize: 11, color: Colors.white)),
            ),
        ],
      );

  Widget _form(
    BuildContext context,
    List<MatchInsightsResponseFormHome> home,
    List<MatchInsightsResponseFormHome> away,
  ) {
    if (home.isEmpty && away.isEmpty) return const SizedBox.shrink();
    return SectionCard(title: context.tr('match.form'), children: [
      if (home.isNotEmpty) _formRow(context, home),
      if (away.isNotEmpty) ...[const SizedBox(height: 6), _formRow(context, away)],
    ]);
  }

  Widget _next(BuildContext context, List<NextHome> home, List<NextHome> away) {
    final all = [...home, ...away];
    if (all.isEmpty) return const SizedBox.shrink();
    return SectionCard(title: context.tr('match.next'), children: [
      for (final n in all) Text('${n.opponent} · ${n.kickoffTime}'),
    ]);
  }
}
