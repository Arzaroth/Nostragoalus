import 'package:flutter/material.dart';

import '../../api/models.gen.dart';
import '../../theme/app_theme.dart';
import 'panel.dart';
import 'score_pill.dart';
import 'team_flag.dart';

/// One fixture as a board row: flag + name on each side of the scoreboard, and
/// a quiet second line for the kickoff date, the lock, and the player's own
/// pick. Rows live on a [Panel]; the board draws the hairlines between them.
class MatchCard extends StatelessWidget {
  const MatchCard({
    super.key,
    required this.homeTeam,
    required this.awayTeam,
    required this.homeCode,
    required this.awayCode,
    required this.status,
    required this.kickoffLabel,
    this.kickoffTime,
    this.homeGoals,
    this.awayGoals,
    this.locked = false,
    this.pickLabel,
    this.onTap,
  });

  final String homeTeam;
  final String awayTeam;
  final String? homeCode;
  final String? awayCode;
  final StatusValue status;

  /// The full kickoff line ("Sat 14 Jun · 21:00").
  final String kickoffLabel;

  /// Just the time, shown on the scoreboard for a scheduled match.
  final String? kickoffTime;
  final int? homeGoals;
  final int? awayGoals;
  final bool locked;

  /// The player's pick for this match ("you 2 - 0"), when they made one.
  final String? pickLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final live = ScorePill.isLive(status);
    final finished = status == StatusValue.finished || status == StatusValue.awarded;
    final subline = <Widget>[
      if (locked && !finished) ...[
        Icon(Icons.lock, size: 12, color: t.faint),
        const SizedBox(width: 4),
      ],
      Flexible(
        child: Text(kickoffLabel,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelSmall?.copyWith(color: t.faint)),
      ),
      if (pickLabel != null) ...[
        const SizedBox(width: 10),
        Flexible(
          child: Text(pickLabel!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelSmall?.copyWith(color: t.muted, fontWeight: FontWeight.w600)),
        ),
      ],
    ];
    return InkWell(
      onTap: onTap,
      child: Container(
        decoration: live
            ? BoxDecoration(
                border: BorderDirectional(start: BorderSide(color: t.live, width: 3)),
              )
            : null,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Column(
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(child: _team(theme, homeTeam, homeCode, end: true)),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: ScorePill(
                    status: status,
                    home: homeGoals,
                    away: awayGoals,
                    kickoff: kickoffTime,
                  ),
                ),
                Expanded(child: _team(theme, awayTeam, awayCode, end: false)),
              ],
            ),
            const SizedBox(height: 8),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: subline),
          ],
        ),
      ),
    );
  }

  Widget _team(ThemeData theme, String name, String? code, {required bool end}) {
    final label = Flexible(
      child: Text(
        name,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        textAlign: end ? TextAlign.end : TextAlign.start,
        style: theme.textTheme.titleSmall,
      ),
    );
    final flag = TeamFlag(code, height: 24);
    return Row(
      mainAxisAlignment: end ? MainAxisAlignment.end : MainAxisAlignment.start,
      children: end ? [label, const SizedBox(width: 10), flag] : [flag, const SizedBox(width: 10), label],
    );
  }
}
