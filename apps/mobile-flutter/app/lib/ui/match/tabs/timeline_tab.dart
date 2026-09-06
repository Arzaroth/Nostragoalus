import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/models.gen.dart';
import '../../../i18n/i18n_scope.dart';
import '../../../state/providers.dart';
import '../../../theme/app_theme.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/panel.dart';
import '../timeline_label.dart';

/// Play-by-play, newest event last, labelled through the shared pbp spec. Each
/// event is a hairline row: the minute on the scoreboard face, the event glyph
/// and text, and the running score when the event carries one.
class TimelineTab extends ConsumerWidget {
  const TimelineTab({super.key, required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final t = context.tokens;
    return AsyncValueView<MatchTimelineResponse>(
      value: ref.watch(matchTimelineProvider(matchId)),
      onRetry: () => ref.invalidate(matchTimelineProvider(matchId)),
      data: (res) {
        if (res.events.isEmpty) {
          return EmptyState(icon: Icons.timeline_outlined, message: context.tr('match.noEvents'));
        }
        return ListView(
          padding: const EdgeInsets.only(top: 8, bottom: 24),
          children: [
            Panel(children: [
              for (final e in res.events)
                if (label(context, e) case final text? when text.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 44,
                          child: Text(e.minute == null || e.minute!.isEmpty ? '' : "${e.minute}'",
                              style: t.score(17, weight: FontWeight.w600, color: t.muted)),
                        ),
                        if (timelineIcons[e.kind] case final icon? when icon.isNotEmpty) ...[
                          Text(icon, style: theme.textTheme.bodyMedium),
                          const SizedBox(width: 8),
                        ],
                        Expanded(child: Text(text)),
                        if (e.homeScore != null && e.awayScore != null) ...[
                          const SizedBox(width: 12),
                          Text('${e.homeScore} - ${e.awayScore}', style: t.score(20)),
                        ],
                      ],
                    ),
                  ),
            ]),
          ],
        );
      },
    );
  }

  /// Null when the event has nothing renderable (an unknown provider kind).
  static String? label(BuildContext context, Event e) {
    final spec = pbpTextSpec(
      kind: e.kind,
      playerName: e.playerName,
      playerInName: e.playerInName,
      playerOutName: e.playerOutName,
      periodKind: e.periodKind,
      text: e.text,
    );
    if (spec.literal != null) return spec.literal;
    return spec.key.isEmpty ? null : context.tr(spec.key, spec.params);
  }
}
