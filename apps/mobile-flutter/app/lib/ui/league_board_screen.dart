import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../state/providers.dart';
import '../voice/voice_service.dart';
import 'league_chat_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/movement_arrow.dart';
import 'widgets/voice_bar.dart';

/// One board row of the points/survival union, read defensively: the endpoint
/// is not in the OpenAPI snapshot, so every field is optional here.
class _BoardRow {
  _BoardRow(Map<String, dynamic> r)
      : name = (r['displayName'] ?? r['name'] ?? '?').toString(),
        rank = _int(r['rank']),
        totalPoints = _int(r['totalPoints']),
        livesLeft = _int(r['livesLeft']),
        movement = _int(r['movement']) ?? 0,
        eliminatedRound = r['eliminatedRoundLabel'] as String?;

  final String name;
  final int? rank;
  final int? totalPoints;
  final int? livesLeft;
  final int movement;
  final String? eliminatedRound;

  bool get isOut => livesLeft == 0 || eliminatedRound != null;

  String get trailing => totalPoints != null
      ? '$totalPoints'
      : livesLeft != null
          ? '♥ $livesLeft'
          : '';

  static int? _int(Object? v) => v is num ? v.toInt() : null;
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
      bottomNavigationBar: VoiceBar(scope: VoiceScope.league(leagueId)),
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
                final raw = rows[i];
                if (raw is! Map) return const SizedBox.shrink();
                final r = _BoardRow(raw.cast<String, dynamic>());
                return ListTile(
                  leading: r.rank != null
                      ? CircleAvatar(
                          backgroundColor: r.isOut ? Theme.of(context).disabledColor : null,
                          child: Text('${r.rank}'))
                      : const Icon(Icons.person),
                  title: Text(r.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: r.isOut
                          ? TextStyle(
                              decoration: TextDecoration.lineThrough,
                              color: Theme.of(context).disabledColor)
                          : null),
                  subtitle: r.eliminatedRound != null ? Text(r.eliminatedRound!) : null,
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      MovementArrow(delta: r.movement),
                      const SizedBox(width: 6),
                      Text(r.trailing, style: Theme.of(context).textTheme.titleMedium),
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
