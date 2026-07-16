import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'match_detail_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/score_pill.dart';

/// Fixtures list. Tap a match to open its detail + make a prediction.
class MatchesScreen extends ConsumerWidget {
  const MatchesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matches = ref.watch(matchesProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('nav.matches'))),
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
            return ListView.separated(
              itemCount: res.matches.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) => _MatchTile(res.matches[i]),
            );
          },
        ),
      ),
    );
  }
}

class _MatchTile extends StatelessWidget {
  const _MatchTile(this.match);
  final Match match;

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
