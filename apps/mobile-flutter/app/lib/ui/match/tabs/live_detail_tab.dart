import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../i18n/i18n_scope.dart';
import '../../../state/providers.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/section_card.dart';
import '../live_detail.dart';

/// Upstream live match detail: venue, attendance, cards, per-team stats, goals,
/// bookings and subs. Renders only what the feed exposes and only stats we have
/// a label for.
class LiveDetailTab extends ConsumerWidget {
  const LiveDetailTab({super.key, required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<Map<String, dynamic>?>(
      value: ref.watch(matchLiveDetailProvider(matchId)),
      onRetry: () => ref.invalidate(matchLiveDetailProvider(matchId)),
      data: (raw) {
        if (raw == null || raw.isEmpty) {
          return EmptyState(message: context.tr('match.noLiveDetail'));
        }
        final d = LiveDetail.fromJson(raw);
        if (d.isEmpty) return EmptyState(message: context.tr('match.noLiveDetail'));
        return ListView(
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            if (d.stadium != null)
              ListTile(
                dense: true,
                leading: const Icon(Icons.stadium),
                title: Text(d.stadium!),
                subtitle: d.attendance != null ? Text(d.attendance!) : null,
              ),
            _cards(context, d.cards),
            _stats(context, d),
            _events(context, context.tr('match.goals'), d.goals, (e) => e.player ?? ''),
            _events(context, context.tr('match.bookings'), d.bookings,
                (e) => e.detail == null ? (e.player ?? '') : '${e.player ?? ''} (${e.detail})'),
            _events(context, context.tr('match.subs'), d.substitutions,
                (e) => '${e.detail ?? ''} → ${e.player ?? ''}'),
          ],
        );
      },
    );
  }

  Widget _cards(BuildContext context, LiveDetailCards? c) {
    if (c == null || c.isEmpty) return const SizedBox.shrink();
    return ListTile(
      dense: true,
      leading: const Icon(Icons.style),
      title: Text(context.tr('match.bookings')),
      trailing: Text('🟨 ${c.homeYellow}-${c.awayYellow}   🟥 ${c.homeRed}-${c.awayRed}'),
    );
  }

  Widget _stats(BuildContext context, LiveDetail d) {
    final keys = [
      for (final k in liveStatLabels.keys)
        if (d.homeStats.containsKey(k) || d.awayStats.containsKey(k)) k,
    ];
    if (keys.isEmpty) return const SizedBox.shrink();
    String cell(num? v) => v == null ? '-' : '${v.toInt()}';
    return SectionCard(
      title: context.tr('match.stats'),
      children: [
        for (final k in keys)
          Row(
            children: [
              SizedBox(width: 40, child: Text(cell(d.homeStats[k]))),
              Expanded(child: Text(context.tr(liveStatLabels[k]!), textAlign: TextAlign.center)),
              SizedBox(
                  width: 40,
                  child: Text(cell(d.awayStats[k]), textAlign: TextAlign.end)),
            ],
          ),
      ],
    );
  }

  Widget _events(
    BuildContext context,
    String title,
    List<LiveDetailEvent> items,
    String Function(LiveDetailEvent) label,
  ) {
    if (items.isEmpty) return const SizedBox.shrink();
    return SectionCard(
      title: title,
      children: [
        for (final e in items)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Text('${e.minute == null ? '' : "${e.minute}'"} ${label(e)}'.trim()),
          ),
      ],
    );
  }
}
