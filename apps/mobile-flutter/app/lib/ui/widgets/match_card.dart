import 'package:flutter/material.dart';

import '../../api/models.gen.dart';
import 'score_pill.dart';
import 'team_flag.dart';

/// One match, flag-forward, matching the web's compact match card: each team as
/// a flag + name flanking a bold centre score/status, with the kickoff line and
/// a lock marker below. Replaces the plain list-tile row so fixtures read like
/// the web app rather than a generic Material list.
class MatchCard extends StatelessWidget {
  const MatchCard({
    super.key,
    required this.homeTeam,
    required this.awayTeam,
    required this.homeCode,
    required this.awayCode,
    required this.status,
    required this.kickoffLabel,
    this.homeGoals,
    this.awayGoals,
    this.locked = false,
    this.onTap,
  });

  final String homeTeam;
  final String awayTeam;
  final String? homeCode;
  final String? awayCode;
  final StatusValue status;
  final String kickoffLabel;
  final int? homeGoals;
  final int? awayGoals;
  final bool locked;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(child: _team(theme, homeTeam, homeCode, alignEnd: true)),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: ScorePill(status: status, home: homeGoals, away: awayGoals),
                  ),
                  Expanded(child: _team(theme, awayTeam, awayCode, alignEnd: false)),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (locked) ...[
                    Icon(Icons.lock, size: 13, color: scheme.outline),
                    const SizedBox(width: 5),
                  ],
                  Text(kickoffLabel,
                      style: theme.textTheme.bodySmall?.copyWith(color: scheme.outline)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _team(ThemeData theme, String name, String? code, {required bool alignEnd}) {
    final label = Flexible(
      child: Text(
        name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        textAlign: alignEnd ? TextAlign.end : TextAlign.start,
        style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
      ),
    );
    final flag = TeamFlag(code, height: 22);
    return Row(
      mainAxisAlignment: alignEnd ? MainAxisAlignment.end : MainAxisAlignment.start,
      children: alignEnd
          ? [label, const SizedBox(width: 8), flag]
          : [flag, const SizedBox(width: 8), label],
    );
  }
}
