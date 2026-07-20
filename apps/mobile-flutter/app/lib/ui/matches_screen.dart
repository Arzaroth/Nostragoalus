import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'competition_switcher.dart';
import 'match_detail_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/notifications_bell.dart';
import 'widgets/score_pill.dart';

/// Fixtures list, grouped by round. A round whose matches have all been played
/// starts collapsed (the final is never folded), so the list lands on what is
/// still to come. Tap a match to open its detail + make a prediction.
class MatchesScreen extends ConsumerWidget {
  const MatchesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matches = ref.watch(matchesProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('nav.matches')),
        actions: const [CompetitionSwitcher(), NotificationsBell()],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(matchesProvider.future),
        child: AsyncValueView<MatchesResponse>(
          value: matches,
          onRetry: () => ref.invalidate(matchesProvider),
          data: (res) {
            if (res.matches.isEmpty) {
              return ListView(children: [
                const SizedBox(height: 80),
                Center(child: Text(context.tr('matches.empty'))),
              ]);
            }
            final rounds = _groupByRound(res.matches);
            return ListView.builder(
              itemCount: rounds.length,
              itemBuilder: (context, i) => _RoundGroup(rounds[i]),
            );
          },
        ),
      ),
    );
  }

  List<_Round> _groupByRound(List<Match2> matches) {
    final byId = <String, _Round>{};
    for (final m in matches) {
      (byId[m.roundId] ??= _Round(m.roundId, m.roundLabel, m.roundSortOrder))
          .matches
          .add(m);
    }
    return byId.values.toList()..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }
}

class _Round {
  _Round(this.id, this.label, this.sortOrder);
  final String id;
  final String label;
  final int sortOrder;
  final List<Match2> matches = [];

  // Concluded = every match played; the final round is never treated as foldable.
  bool get allPlayed => matches.every((m) => m.status == 'FINISHED');
  bool get isFinal => matches.any((m) => m.stage == 'FINAL');
}

class _RoundGroup extends StatelessWidget {
  const _RoundGroup(this.round);
  final _Round round;

  @override
  Widget build(BuildContext context) {
    final collapsed = round.allPlayed && !round.isFinal;
    return ExpansionTile(
      key: PageStorageKey(round.id),
      initiallyExpanded: !collapsed,
      title: Text(round.label, style: Theme.of(context).textTheme.titleSmall),
      childrenPadding: EdgeInsets.zero,
      children: [
        for (final m in round.matches) _MatchTile(m),
      ],
    );
  }
}

class _MatchTile extends StatelessWidget {
  const _MatchTile(this.match);
  final Match2 match;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: match.isLocked ? const Icon(Icons.lock, size: 18) : const Icon(Icons.schedule, size: 18),
      title: Text('${match.homeTeam} v ${match.awayTeam}'),
      subtitle: Text(match.roundLabel),
      trailing: ScorePill(status: match.status, home: match.fullTimeHome, away: match.fullTimeAway),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => MatchDetailScreen(matchId: match.id)),
      ),
    );
  }
}
