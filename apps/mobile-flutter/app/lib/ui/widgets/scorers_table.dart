import 'package:flutter/material.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';
import '../../theme/app_theme.dart';
import 'empty_state.dart';
import 'panel.dart';
import 'team_flag.dart';

/// Golden Boot + assists leaders (goals table, then assists table), each a
/// board with a quiet header row and the count on the scoreboard face.
class ScorersTable extends StatelessWidget {
  const ScorersTable({super.key, required this.scorers, required this.assists});
  final List<Scorer> scorers;
  final List<Scorer> assists;

  static const _numWidth = 44.0;

  @override
  Widget build(BuildContext context) {
    if (scorers.isEmpty && assists.isEmpty) {
      return EmptyState(icon: Icons.sports_soccer_outlined, message: context.tr('stats.empty'));
    }
    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        if (scorers.isNotEmpty)
          _table(context, context.tr('bestScorer.topScorers'), context.tr('match.goals'),
              [for (final s in scorers) (s, s.goals.toInt())]),
        if (assists.isNotEmpty)
          _table(context, context.tr('stats.assists'), context.tr('stats.assists'),
              [for (final a in assists) (a, (a.assists ?? 0).toInt())]),
      ],
    );
  }

  Widget _table(BuildContext context, String title, String countLabel, List<(Scorer, int)> rows) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final head = theme.textTheme.labelSmall?.copyWith(color: t.faint);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PanelHeading(title: title, padding: const EdgeInsets.fromLTRB(20, 16, 20, 8)),
        Panel(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
            child: Row(
              children: [
                SizedBox(
                    width: _numWidth,
                    child: Text(countLabel, textAlign: TextAlign.center, style: head)),
                Expanded(child: Text(context.tr('stats.player'), style: head)),
              ],
            ),
          ),
          for (final (s, n) in rows) _row(context, s, n),
        ]),
      ],
    );
  }

  Widget _row(BuildContext context, Scorer s, int n) {
    final theme = Theme.of(context);
    final t = context.tokens;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 10, 16, 10),
      child: Row(
        children: [
          SizedBox(
            width: _numWidth,
            child: Text('$n', textAlign: TextAlign.center, style: t.score(22)),
          ),
          TeamFlag(s.teamCode, height: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.playerName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
                Text(s.teamName, maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodySmall),
              ],
            ),
          ),
          if ((s.penalties ?? 0) > 0) ...[
            const SizedBox(width: 8),
            Text(context.tr('stats.penalties', {'n': s.penalties!.toInt()}),
                style: theme.textTheme.labelSmall?.copyWith(color: t.faint)),
          ],
        ],
      ),
    );
  }
}
