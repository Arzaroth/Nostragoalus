import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/models.gen.dart';
import '../../../i18n/i18n_scope.dart';
import '../../../state/providers.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/empty_state.dart';
import '../timeline_label.dart';

/// Play-by-play, newest event last, labelled through the shared pbp spec.
class TimelineTab extends ConsumerWidget {
  const TimelineTab({super.key, required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<MatchTimelineResponse>(
      value: ref.watch(matchTimelineProvider(matchId)),
      onRetry: () => ref.invalidate(matchTimelineProvider(matchId)),
      data: (res) {
        if (res.events.isEmpty) return EmptyState(message: context.tr('match.noEvents'));
        return ListView(
          children: [
            for (final e in res.events)
              if (label(context, e) case final text? when text.isNotEmpty)
                ListTile(
                  dense: true,
                  leading: Text('${timelineIcons[e.kind] ?? ''} ${e.minute ?? ''}'.trim()),
                  title: Text(text),
                  trailing: e.homeScore != null && e.awayScore != null
                      ? Text('${e.homeScore}-${e.awayScore}',
                          style: Theme.of(context).textTheme.labelLarge)
                      : null,
                ),
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
