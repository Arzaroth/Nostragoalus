import 'package:flutter/material.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';
import 'movement_arrow.dart';
import 'team_flag.dart';

/// One standings row, matching the web's LeaderboardRowCard: a medal-or-number
/// rank with its movement, an avatar, the name flanked by the player's champion
/// and best-scorer flags, an exact/correct line, and the points. The signed-in
/// player's own row is outlined in the primary colour.
class LeaderboardRowCard extends StatelessWidget {
  const LeaderboardRowCard({super.key, required this.row, this.meId, this.onTap});

  final LeaderboardResponseRow row;
  final String? meId;
  final VoidCallback? onTap;

  static String? _medal(int rank) => switch (rank) {
        1 => '🥇',
        2 => '🥈',
        3 => '🥉',
        _ => null,
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final muted = scheme.onSurfaceVariant;
    final isMe = meId != null && row.userId == meId;
    final rank = row.rank.toInt();
    final medal = _medal(rank);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: isMe ? BorderSide(color: scheme.primary, width: 1.5) : BorderSide.none,
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              SizedBox(
                width: 34,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    medal != null
                        ? Text(medal, style: const TextStyle(fontSize: 20))
                        : Text('$rank',
                            style: theme.textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.bold, color: muted)),
                    MovementArrow(delta: (row.movement ?? 0).toInt()),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _Avatar(image: row.image, name: row.displayName, scheme: scheme),
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
                              style: theme.textTheme.titleSmall
                                  ?.copyWith(fontWeight: FontWeight.w600)),
                        ),
                        if (row.championCode != null) ...[
                          const SizedBox(width: 8),
                          _BadgeFlag(code: row.championCode!, badge: '👑'),
                        ],
                        if (row.bestScorerCode != null) ...[
                          const SizedBox(width: 8),
                          _BadgeFlag(code: row.bestScorerCode!, badge: '⚽'),
                        ],
                        if (isMe) ...[
                          const SizedBox(width: 8),
                          Text(context.tr('leaderboard.you'),
                              style: theme.textTheme.labelSmall?.copyWith(color: scheme.primary)),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _subtitle(context),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(color: muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  RichText(
                    text: TextSpan(children: [
                      TextSpan(
                          text: '${row.totalPoints.toInt()}',
                          style: theme.textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.bold, color: scheme.onSurface)),
                      TextSpan(
                          text: ' ${context.tr('leaderboard.pts')}',
                          style: theme.textTheme.bodySmall?.copyWith(color: muted)),
                    ]),
                  ),
                  if (row.livePoints > 0)
                    Text('+${row.livePoints.toInt()} ${context.tr('leaderboard.live')}',
                        style: theme.textTheme.labelSmall
                            ?.copyWith(color: scheme.error, fontWeight: FontWeight.bold)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _subtitle(BuildContext context) {
    final parts = <String>[
      '${row.exactCount.toInt()} ${context.tr('leaderboard.exact')}',
      '${row.outcomeCount.toInt()} ${context.tr('leaderboard.correct')}',
    ];
    if (row.championPoints > 0) parts.add('👑 +${row.championPoints.toInt()}');
    if (row.bestScorerPoints > 0) parts.add('⚽ +${row.bestScorerPoints.toInt()}');
    return parts.join(' · ');
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.image, required this.name, required this.scheme});
  final String? image;
  final String name;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    final url = image;
    final initial = name.isEmpty ? '?' : name.characters.first.toUpperCase();
    return CircleAvatar(
      radius: 18,
      backgroundColor: scheme.primaryContainer,
      foregroundImage: (url != null && url.startsWith('http')) ? NetworkImage(url) : null,
      child: Text(initial,
          style: TextStyle(color: scheme.onPrimaryContainer, fontWeight: FontWeight.w600)),
    );
  }
}

/// A small flag with a corner emoji badge (champion crown / best-scorer ball).
class _BadgeFlag extends StatelessWidget {
  const _BadgeFlag({required this.code, required this.badge});
  final String code;
  final String badge;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 22,
      height: 20,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          TeamFlag(code, height: 16),
          Positioned(top: -6, left: -3, child: Text(badge, style: const TextStyle(fontSize: 11))),
        ],
      ),
    );
  }
}
