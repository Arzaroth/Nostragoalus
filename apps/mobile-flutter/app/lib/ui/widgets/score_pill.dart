import 'package:flutter/material.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';
import '../../theme/app_theme.dart';
import 'panel.dart';

/// The scoreboard: the score in condensed numerals once a match is under way,
/// otherwise the kickoff time (or the localized status when there is no time to
/// show). Live scores carry the breathing dot; a finished score goes quiet.
class ScorePill extends StatelessWidget {
  const ScorePill({
    super.key,
    required this.status,
    this.home,
    this.away,
    this.size = 26,
    this.kickoff,
  });

  final StatusValue status;
  final int? home;
  final int? away;

  /// Numeral size; the status line scales with it.
  final double size;

  /// Shown instead of the status word for a scheduled match ("21:00").
  final String? kickoff;

  static const _live = {StatusValue.live, StatusValue.paused};
  // Awarded (walkover) matches carry a final score, so show it like any played match.
  static const _played = {
    StatusValue.live,
    StatusValue.paused,
    StatusValue.finished,
    StatusValue.awarded,
  };

  static const _statusKeys = {
    StatusValue.scheduled: 'scheduled',
    StatusValue.live: 'live',
    StatusValue.paused: 'halfTime',
    StatusValue.finished: 'fullTime',
    StatusValue.postponed: 'postponed',
    StatusValue.cancelled: 'cancelled',
    StatusValue.suspended: 'suspended',
    StatusValue.awarded: 'awarded',
    StatusValue.interrupted: 'interrupted',
  };

  static bool isLive(StatusValue s) => _live.contains(s);

  static String statusLabel(BuildContext context, StatusValue status) {
    final key = _statusKeys[status];
    return key == null ? status.wire : context.tr('match.statusLabel.$key');
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final scheme = Theme.of(context).colorScheme;
    final hasScore = _played.contains(status) && home != null && away != null;
    final live = _live.contains(status);

    if (hasScore) {
      final color = live ? scheme.onSurface : scheme.onSurface.withValues(alpha: 0.85);
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('$home - $away', style: t.score(size, color: color)),
          if (live) ...[
            const SizedBox(height: 4),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                LiveDot(size: size * 0.24),
                SizedBox(width: size * 0.2),
                Text(statusLabel(context, status),
                    style: Theme.of(context)
                        .textTheme
                        .labelSmall
                        ?.copyWith(color: t.live, fontWeight: FontWeight.w600)),
              ],
            ),
          ],
        ],
      );
    }

    final scheduled = status == StatusValue.scheduled && kickoff != null;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          scheduled ? kickoff! : statusLabel(context, status),
          style: scheduled
              ? t.score(size * 0.85, weight: FontWeight.w500, color: t.muted)
              : Theme.of(context).textTheme.labelMedium?.copyWith(color: t.muted),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}
