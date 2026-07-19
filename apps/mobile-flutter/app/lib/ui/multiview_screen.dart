import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'match_detail_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/score_pill.dart';

/// A grid of the in-play matches, updated live over the WS hub.
class MultiviewScreen extends ConsumerWidget {
  const MultiviewScreen({super.key});

  static const _live = {'LIVE', 'PAUSED'};

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matches = ref.watch(matchesProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('nav.multiview'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(matchesProvider.future),
        child: AsyncValueView<MatchesResponse>(
          value: matches,
          onRetry: () => ref.invalidate(matchesProvider),
          data: (res) {
            final live = res.matches.where((m) => _live.contains(m.status)).toList();
            if (live.isEmpty) {
              return ListView(children: [
                const SizedBox(height: 80),
                Center(child: Text(context.tr('multiview.empty'))),
              ]);
            }
            return GridView.count(
              crossAxisCount: 2,
              padding: const EdgeInsets.all(8),
              childAspectRatio: 1.3,
              children: [for (final m in live) _Tile(m)],
            );
          },
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile(this.match);
  final Match2 match;

  @override
  Widget build(BuildContext context) => Card(
        child: InkWell(
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => MatchDetailScreen(matchId: match.id)),
          ),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(match.homeTeam, maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                ScorePill(status: match.status, home: match.fullTimeHome, away: match.fullTimeAway),
                const SizedBox(height: 4),
                Text(match.awayTeam, maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ),
      );
}
