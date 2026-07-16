import 'package:flutter/material.dart';

/// A compact score / status chip. Shows the score once a match is under way,
/// otherwise the status (SCHEDULED, POSTPONED, ...).
class ScorePill extends StatelessWidget {
  const ScorePill({super.key, required this.status, this.home, this.away});

  final String status;
  final int? home;
  final int? away;

  static const _live = {'LIVE', 'PAUSED'};
  static const _played = {'LIVE', 'PAUSED', 'FINISHED'};

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final hasScore = _played.contains(status) && home != null && away != null;
    final isLive = _live.contains(status);
    final label = hasScore ? '$home - $away' : status;
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
