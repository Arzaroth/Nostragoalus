import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'competition_switcher.dart';
import 'match_detail_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/score_pill.dart';

/// The knockout bracket - rounds of ties, with the champion when decided.
class BracketScreen extends ConsumerWidget {
  const BracketScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bracket = ref.watch(bracketProvider);
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
              return Center(child: Text(context.tr('bracket.empty')));
            }
            return ListView(
              children: [
                if (b.winner != null)
                  Card(
                    margin: const EdgeInsets.all(12),
                    color: Theme.of(context).colorScheme.primaryContainer,
                    child: ListTile(
                      leading: const Icon(Icons.emoji_events, color: Colors.amber),
                      title: Text(b.winner!.name),
                      subtitle: Text(context.tr('bracket.champion')),
                    ),
                  ),
                for (final round in b.rounds) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                    child: Text(round.name, style: Theme.of(context).textTheme.titleMedium),
                  ),
                  for (final m in round.matches)
                    ListTile(
                      dense: true,
                      title: Text('${m.homeTeam} v ${m.awayTeam}'),
                      trailing: ScorePill(
                          status: m.status,
                          home: m.homeScore?.toInt(),
                          away: m.awayScore?.toInt()),
                      onTap: m.id == null
                          ? null
                          : () => Navigator.of(context).push(MaterialPageRoute(
                                builder: (_) => MatchDetailScreen(matchId: m.id!),
                              )),
                    ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}
