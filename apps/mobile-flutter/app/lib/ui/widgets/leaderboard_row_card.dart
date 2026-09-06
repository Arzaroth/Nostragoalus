import 'package:flutter/material.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';
import '../../theme/app_theme.dart';
import 'panel.dart';
import 'movement_arrow.dart';
import 'team_flag.dart';
import 'user_avatar.dart';

/// One standings row: the rank in condensed numerals (gold, silver, bronze for
/// the podium) with its movement, the avatar, the name flanked by the player's
/// champion and best-scorer flags, an exact/correct line, and the points. The
/// signed-in player's own row is tinted.
class LeaderboardRowCard extends StatelessWidget {
  const LeaderboardRowCard({
    super.key,
    required this.row,
    this.meId,
    this.onTap,
    this.radius = BorderRadius.zero,
  });

  final LeaderboardResponseRow row;
  final String? meId;
  final VoidCallback? onTap;

  /// The panel corners this row sits on (first / last row), so the own-row
  /// tint and the ink stay inside the rounded surface.
  final BorderRadius radius;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final t = context.tokens;
    final isMe = meId != null && row.userId == meId;
    final rank = row.rank.toInt();
    final rankColor = t.rankColor(rank);

    final body = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          SizedBox(
            width: 36,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$rank', style: t.score(24, color: rankColor)),
                MovementArrow(delta: (row.movement ?? 0).toInt()),
              ],
            ),
          ),
          UserAvatar(name: row.displayName, image: row.image),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(row.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleSmall),
                    ),
                    if (row.championCode != null) ...[
                      const SizedBox(width: 8),
                      _BadgeFlag(code: row.championCode!, icon: Icons.emoji_events, color: t.amber),
                    ],
                    if (row.bestScorerCode != null) ...[
                      const SizedBox(width: 6),
                      _BadgeFlag(code: row.bestScorerCode!, icon: Icons.sports_soccer, color: t.emerald),
                    ],
                    if (isMe) ...[
                      const SizedBox(width: 8),
                      Tag(context.tr('leaderboard.you'), color: scheme.primary),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  _subtitle(context),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(color: t.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('${row.totalPoints.toInt()}', style: t.score(26)),
              if (row.livePoints > 0)
                Text('+${row.livePoints.toInt()}',
                    style: t.score(14, weight: FontWeight.w600, color: t.live))
              else
                Text(context.tr('leaderboard.pts'),
                    style: theme.textTheme.labelSmall?.copyWith(color: t.faint)),
            ],
          ),
        ],
      ),
    );

    final tinted = isMe
        ? ColoredBox(color: scheme.primary.withValues(alpha: 0.10), child: body)
        : body;
    return ClipRRect(
      borderRadius: radius,
      child: Material(
        color: Colors.transparent,
        child: InkWell(onTap: onTap, borderRadius: radius, child: tinted),
      ),
    );
  }

  String _subtitle(BuildContext context) {
    final parts = <String>[
      '${row.exactCount.toInt()} ${context.tr('leaderboard.exact')}',
      '${row.outcomeCount.toInt()} ${context.tr('leaderboard.correct')}',
    ];
    if (row.championPoints > 0) parts.add('+${row.championPoints.toInt()} 👑');
    if (row.bestScorerPoints > 0) parts.add('+${row.bestScorerPoints.toInt()} ⚽');
    return parts.join('  ');
  }
}

/// A small flag with a corner glyph (champion crown / best-scorer ball).
class _BadgeFlag extends StatelessWidget {
  const _BadgeFlag({required this.code, required this.icon, required this.color});
  final String code;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 26,
      height: 20,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          TeamFlag(code, height: 16),
          PositionedDirectional(
            top: -6,
            end: -2,
            child: Icon(icon, size: 12, color: color),
          ),
        ],
      ),
    );
  }
}
