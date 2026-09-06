import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'competition_switcher.dart';
import 'match_detail_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/panel.dart';
import 'widgets/score_pill.dart';
import 'widgets/team_flag.dart';

/// The knockout bracket - rounds of ties, with the champion when decided.
class BracketScreen extends ConsumerWidget {
  const BracketScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bracket = ref.watch(bracketProvider);
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('nav.bracket')), actions: const [CompetitionSwitcher()]),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(bracketProvider.future),
        child: AsyncValueView<BracketResponse>(
          value: bracket,
          onRetry: () => ref.invalidate(bracketProvider),
          data: (res) {
            final b = res.bracket;
            if (b == null || b.rounds.isEmpty) {
              return EmptyState(icon: Icons.account_tree_outlined, message: context.tr('bracket.empty'));
            }
            return ListView(
              padding: const EdgeInsets.only(top: 4, bottom: 24),
              children: [
                if (b.winner != null)
                  Panel(
                    tint: t.amber.withValues(alpha: 0.10),
                    children: [
                      PanelRow(
                        leading: Icon(Icons.emoji_events, color: t.amber),
                        title: Text(b.winner!.name),
                        subtitle: Text(context.tr('bracket.champion')),
                        trailing: TeamFlag(b.winner!.code, height: 22),
                      ),
                    ],
                  ),
                for (final round in b.rounds) ...[
                  PanelHeading(
                    title: round.name,
                    trailing: '${round.matches.length}',
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                  ),
                  Panel(children: [for (final m in round.matches) _TieRow(m)]),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

/// One tie: flag + name on each side of the scoreboard.
class _TieRow extends StatelessWidget {
  const _TieRow(this.m);
  final Match m;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    Widget team(String name, String? code, {required bool end}) {
      final label = Flexible(
        child: Text(name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            textAlign: end ? TextAlign.end : TextAlign.start,
            style: theme.textTheme.titleSmall),
      );
      final flag = TeamFlag(code, height: 20);
      return Row(
        mainAxisAlignment: end ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: end ? [label, const SizedBox(width: 10), flag] : [flag, const SizedBox(width: 10), label],
      );
    }

    return InkWell(
      onTap: m.id == null
          ? null
          : () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => MatchDetailScreen(matchId: m.id!),
              )),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Expanded(child: team(m.homeTeam, m.homeCode, end: true)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: ScorePill(
                status: StatusValue.from(m.status),
                home: m.homeScore?.toInt(),
                away: m.awayScore?.toInt(),
                size: 24,
              ),
            ),
            Expanded(child: team(m.awayTeam, m.awayCode, end: false)),
          ],
        ),
      ),
    );
  }
}
