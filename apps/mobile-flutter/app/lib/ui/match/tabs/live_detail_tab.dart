import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/models.gen.dart';
import '../../../i18n/i18n_scope.dart';
import '../../../state/providers.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/section_card.dart';
import '../live_detail.dart';

/// Upstream live match detail: venue, attendance, cards, per-team stats, goals,
/// bookings and subs. The endpoint is contract-typed, so this renders whatever
/// the feed actually filled in - nothing is dropped for want of a label.
class LiveDetailTab extends ConsumerWidget {
  const LiveDetailTab({super.key, required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncValueView<Detail?>(
      value: ref.watch(matchLiveDetailProvider(matchId)),
      onRetry: () => ref.invalidate(matchLiveDetailProvider(matchId)),
      data: (d) {
        if (d == null || liveDetailIsEmpty(d)) {
          return EmptyState(message: context.tr('match.noLiveDetail'));
        }
        return ListView(
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            if (d.stadium != null)
              ListTile(
                dense: true,
                leading: const Icon(Icons.stadium),
                title: Text(d.stadium!),
                subtitle:
                    d.attendance != null ? Text('${d.attendance!.toInt()}') : null,
              ),
            _cards(context, d.cards),
            _stats(context, d),
            _events(
              context,
              context.tr('match.goals'),
              [for (final g in d.goals) (g.minute, g.playerName)],
            ),
            _events(
              context,
              context.tr('match.bookings'),
              [for (final b in d.bookings) (b.minute, '${b.playerName} (${b.card.wire})')],
            ),
            _events(
              context,
              context.tr('match.subs'),
              [for (final s in d.substitutions) (s.minute, '${s.playerOffName} → ${s.playerOnName}')],
            ),
          ],
        );
      },
    );
  }

  Widget _cards(BuildContext context, DetailCard c) {
    final hy = c.home.yellow.toInt();
    final ay = c.away.yellow.toInt();
    final hr = c.home.red.toInt();
    final ar = c.away.red.toInt();
    if (hy + ay + hr + ar == 0) return const SizedBox.shrink();
    return ListTile(
      dense: true,
      leading: const Icon(Icons.style),
      title: Text(context.tr('match.bookings')),
      trailing: Text('🟨 $hy-$ay   🟥 $hr-$ar'),
    );
  }

  Widget _stats(BuildContext context, Detail d) {
    final home = liveTeamStats(d.stats?.home);
    final away = liveTeamStats(d.stats?.away);
    final keys = [
      for (final k in liveStatLabels.keys)
        if (home.containsKey(k) || away.containsKey(k)) k,
    ];
    if (keys.isEmpty) return const SizedBox.shrink();
    String cell(num? v) => v == null ? '-' : '${v.toInt()}';
    return SectionCard(
      title: context.tr('match.stats'),
      children: [
        for (final k in keys)
          Row(
            children: [
              SizedBox(width: 40, child: Text(cell(home[k]))),
              Expanded(child: Text(context.tr(liveStatLabels[k]!), textAlign: TextAlign.center)),
              SizedBox(width: 40, child: Text(cell(away[k]), textAlign: TextAlign.end)),
            ],
          ),
      ],
    );
  }

  Widget _events(BuildContext context, String title, List<(String?, String)> items) {
    if (items.isEmpty) return const SizedBox.shrink();
    return SectionCard(
      title: title,
      children: [
        for (final (minute, label) in items)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Text('${liveMinuteLabel(minute)} $label'.trim()),
          ),
      ],
    );
  }
}
