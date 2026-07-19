import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../state/providers.dart';
import '../voice/voice_service.dart';
import 'league_chat_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/voice_bar.dart';

/// A small up/down rank-movement arrow (green up, red down) with the delta.
class _MovementArrow extends StatelessWidget {
  const _MovementArrow(this.movement);
  final int movement;
  @override
  Widget build(BuildContext context) {
    final up = movement > 0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(up ? Icons.arrow_upward : Icons.arrow_downward,
            size: 14, color: up ? Colors.green : Theme.of(context).colorScheme.error),
        Text('${movement.abs()}',
            style: TextStyle(
                fontSize: 12, color: up ? Colors.green : Theme.of(context).colorScheme.error)),
      ],
    );
  }
}

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
                final movement = (r['movement'] as num?)?.toInt();
                final eliminatedRound = r['eliminatedRoundLabel'] as String?;
                final out = (r['livesLeft'] as num?)?.toInt() == 0 || eliminatedRound != null;
                return ListTile(
                  leading: rank != null
                      ? CircleAvatar(
                          backgroundColor: out ? Theme.of(context).disabledColor : null,
                          child: Text('${(rank as num).toInt()}'))
                      : const Icon(Icons.person),
                  title: Text(name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: out
                          ? TextStyle(
                              decoration: TextDecoration.lineThrough,
                              color: Theme.of(context).disabledColor)
                          : null),
                  subtitle: eliminatedRound != null ? Text(eliminatedRound) : null,
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (movement != null && movement != 0) _MovementArrow(movement),
                      const SizedBox(width: 6),
                      Text(trailing, style: Theme.of(context).textTheme.titleMedium),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
