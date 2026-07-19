import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../state/providers.dart';
import '../voice/voice_service.dart';
import 'league_chat_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/voice_bar.dart';

/// A league's board. Rows are a points/survival union (raw maps), rendered by
/// the common fields both variants carry.
class LeagueBoardScreen extends ConsumerWidget {
  const LeagueBoardScreen({super.key, required this.leagueId, required this.name});
  final String leagueId;
  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(leagueBoardProvider(leagueId));
    return Scaffold(
      appBar: AppBar(
        title: Text(name),
        actions: [
          IconButton(
            icon: const Icon(Icons.chat),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => LeagueChatScreen(leagueId: leagueId, name: name),
            )),
          ),
        ],
      ),
      bottomNavigationBar: VoiceBar(scope: VoiceScope(kind: 'league', leagueId: leagueId)),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(leagueBoardProvider(leagueId).future),
        child: AsyncValueView<ModeBoardResponse>(
          value: board,
          onRetry: () => ref.invalidate(leagueBoardProvider(leagueId)),
          data: (res) {
            final rows = res.board.rows;
            return ListView.separated(
              itemCount: rows.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final r = (rows[i] as Map).cast<String, dynamic>();
                final name = (r['displayName'] ?? r['name'] ?? '?').toString();
                final rank = r['rank'];
                // points board -> totalPoints; survival board -> livesLeft.
                final trailing = r.containsKey('totalPoints')
                    ? '${(r['totalPoints'] as num).toInt()}'
                    : r.containsKey('livesLeft')
                        ? '♥ ${(r['livesLeft'] as num).toInt()}'
                        : '';
                return ListTile(
                  leading: rank != null
                      ? CircleAvatar(child: Text('${(rank as num).toInt()}'))
                      : const Icon(Icons.person),
                  title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
                  trailing: Text(trailing, style: Theme.of(context).textTheme.titleMedium),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
