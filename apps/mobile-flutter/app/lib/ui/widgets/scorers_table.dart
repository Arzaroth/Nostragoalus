import 'package:flutter/material.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';

/// Golden Boot + assists leaders (goals table, then assists table).
class ScorersTable extends StatelessWidget {
  const ScorersTable({super.key, required this.scorers, required this.assists});
  final List<Scorer> scorers;
  final List<Scorer> assists;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        if (scorers.isNotEmpty) ...[
          _header(context, context.tr('bestScorer.topScorers')),
          for (final s in scorers) _row(context, s, s.goals.toInt()),
        ],
        if (assists.isNotEmpty) ...[
          _header(context, context.tr('stats.assists')),
          for (final a in assists) _row(context, a, (a.assists ?? 0).toInt()),
        ],
        if (scorers.isEmpty && assists.isEmpty)
          Padding(
            padding: const EdgeInsets.all(40),
            child: Center(child: Text(context.tr('stats.empty'))),
          ),
      ],
    );
  }

  Widget _header(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium),
      );

  Widget _row(BuildContext context, Scorer s, int n) => ListTile(
        dense: true,
        leading: Text('$n', style: Theme.of(context).textTheme.titleMedium),
        title: Text(s.playerName),
        subtitle: Text(s.teamName),
        trailing: (s.penalties ?? 0) > 0
            ? Text(context.tr('stats.penalties', {'n': s.penalties!.toInt()}))
            : null,
      );
}
