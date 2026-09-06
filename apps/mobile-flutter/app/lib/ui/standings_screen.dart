import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'competition_switcher.dart';
import 'scorers_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/panel.dart';
import 'widgets/team_flag.dart';

/// Group standings tables for the active competition, one panel per group.
class StandingsScreen extends ConsumerWidget {
  const StandingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final standings = ref.watch(standingsProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('nav.standings')),
        actions: [
          IconButton(
            icon: const Icon(Icons.sports_soccer_outlined),
            tooltip: context.tr('nav.scorers'),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ScorersScreen()),
            ),
          ),
          const CompetitionSwitcher(),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(standingsProvider.future),
        child: AsyncValueView<StandingsResponse>(
          value: standings,
          onRetry: () => ref.invalidate(standingsProvider),
          data: (res) {
            if (res.groups.isEmpty) {
              return EmptyState(icon: Icons.table_chart_outlined, message: context.tr('standings.empty'));
            }
            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [for (final g in res.groups) _GroupTable(g)],
            );
          },
        ),
      ),
    );
  }
}

class _GroupTable extends StatelessWidget {
  const _GroupTable(this.group);
  final Group group;

  static const _numWidth = 40.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final head = theme.textTheme.labelSmall?.copyWith(color: t.faint);
    Widget num(String s, {TextStyle? style}) => SizedBox(
          width: _numWidth,
          child: Text(s, textAlign: TextAlign.center, style: style),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PanelHeading(
          title: context.tr('matches.group', {'group': group.group}),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
        ),
        Panel(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
              child: Row(
                children: [
                  Expanded(child: Text(context.tr('standings.team'), style: head)),
                  num(context.tr('standings.p'), style: head),
                  num(context.tr('standings.gd'), style: head),
                  num(context.tr('standings.pts'), style: head),
                ],
              ),
            ),
            for (final (i, r) in group.rows.indexed)
              Container(
                decoration: i < 2
                    ? BoxDecoration(
                        border: BorderDirectional(start: BorderSide(color: t.emerald, width: 3)),
                      )
                    : null,
                padding: const EdgeInsetsDirectional.fromSTEB(13, 10, 8, 10),
                child: Row(
                  children: [
                    TeamFlag(r.code, height: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(r.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
                    ),
                    num('${r.played.toInt()}', style: t.score(17, weight: FontWeight.w500, color: t.muted)),
                    num(_signed(r.gd.toInt()), style: t.score(17, weight: FontWeight.w500, color: t.muted)),
                    num('${r.points.toInt()}', style: t.score(20)),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }

  static String _signed(int v) => v > 0 ? '+$v' : '$v';
}
