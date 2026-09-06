import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/models.gen.dart';
import '../../../i18n/i18n_scope.dart';
import '../../../state/providers.dart';
import '../../../theme/app_theme.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/panel.dart';
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
          return EmptyState(icon: Icons.stadium_outlined, message: context.tr('match.noLiveDetail'));
        }
        final venue = _venue(context, d);
        final cards = _cards(context, d.cards);
        return ListView(
          padding: const EdgeInsets.only(top: 8, bottom: 24),
          children: [
            if (venue != null || cards != null)
              Panel(children: [if (venue != null) venue, if (cards != null) cards]),
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

  Widget? _venue(BuildContext context, Detail d) {
    if (d.stadium == null) return null;
    final t = context.tokens;
    return PanelRow(
      leading: const Icon(Icons.stadium_outlined),
      title: Text(d.stadium!),
      trailing: d.attendance != null
          ? Text('${d.attendance!.toInt()}', style: t.score(17, weight: FontWeight.w600, color: t.muted))
          : null,
    );
  }

  Widget? _cards(BuildContext context, DetailCard c) {
    final hy = c.home.yellow.toInt();
    final ay = c.away.yellow.toInt();
    final hr = c.home.red.toInt();
    final ar = c.away.red.toInt();
    if (hy + ay + hr + ar == 0) return null;
    final t = context.tokens;
    return PanelRow(
      leading: const Icon(Icons.style_outlined),
      title: Text(context.tr('match.bookings')),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _cardGlyph(t.amber),
          const SizedBox(width: 6),
          Text('$hy - $ay', style: t.score(17, weight: FontWeight.w600)),
          const SizedBox(width: 14),
          _cardGlyph(t.live),
          const SizedBox(width: 6),
          Text('$hr - $ar', style: t.score(17, weight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _cardGlyph(Color color) => Container(
        width: 9,
        height: 12,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
      );

  Widget _stats(BuildContext context, Detail d) {
    final home = liveTeamStats(d.stats?.home);
    final away = liveTeamStats(d.stats?.away);
    final keys = [
      for (final k in liveStatLabels.keys)
        if (home.containsKey(k) || away.containsKey(k)) k,
    ];
    if (keys.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final t = context.tokens;
    String cell(num? v) => v == null ? '-' : '${v.toInt()}';
    return SectionCard(
      title: context.tr('match.stats'),
      children: [
        for (final k in keys)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                SizedBox(width: 48, child: Text(cell(home[k]), style: t.score(17))),
                Expanded(
                  child: Text(context.tr(liveStatLabels[k]!),
                      textAlign: TextAlign.center,
                      style: theme.textTheme.labelMedium?.copyWith(color: t.muted)),
                ),
                SizedBox(
                    width: 48,
                    child: Text(cell(away[k]), textAlign: TextAlign.end, style: t.score(17))),
              ],
            ),
          ),
      ],
    );
  }

  Widget _events(BuildContext context, String title, List<(String?, String)> items) {
    if (items.isEmpty) return const SizedBox.shrink();
    final t = context.tokens;
    return SectionCard(
      title: title,
      children: [
        for (final (minute, label) in items)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                SizedBox(
                  width: 44,
                  child: Text(liveMinuteLabel(minute),
                      style: t.score(17, weight: FontWeight.w600, color: t.muted)),
                ),
                Expanded(child: Text(label)),
              ],
            ),
          ),
      ],
    );
  }
}
