import 'package:flutter/material.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';

/// A compact score / status chip. Shows the score once a match is under way,
/// otherwise the localized status.
class ScorePill extends StatelessWidget {
  const ScorePill({super.key, required this.status, this.home, this.away});

  final StatusValue status;
  final int? home;
  final int? away;

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

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final hasScore = _played.contains(status) && home != null && away != null;
    final isLive = _live.contains(status);
    final statusKey = _statusKeys[status];
    final label = hasScore
        ? '$home - $away'
        : statusKey == null
            ? status.wire
            : context.tr('match.statusLabel.$statusKey');
    final bg = isLive
        ? scheme.errorContainer
        : hasScore
            ? scheme.secondaryContainer
            : scheme.surfaceContainerHighest;
    final fg = isLive ? scheme.onErrorContainer : scheme.onSurfaceVariant;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
      child: Text(label,
          style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontFeatures: const [])),
    );
  }
}
