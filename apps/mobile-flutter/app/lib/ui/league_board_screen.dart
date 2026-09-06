import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import '../voice/voice_service.dart';
import 'league_chat_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/movement_arrow.dart';
import 'widgets/panel.dart';
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

  static int? _int(Object? v) => v is num ? v.toInt() : null;
}

/// A league's board. Rows are a points/survival union (raw maps), rendered by
/// the common fields both variants carry: rank, movement, name, and either
/// the points or the lives left.
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
            icon: const Icon(Icons.chat_bubble_outline),
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
            final rows = [
              for (final raw in res.board.rows)
                if (raw is Map) _BoardRow(raw.cast<String, dynamic>()),
            ];
            if (rows.isEmpty) {
              return EmptyState(
                  icon: Icons.leaderboard_outlined, message: context.tr('leagues.modeBoardEmpty'));
            }
            return ListView(
              padding: const EdgeInsets.only(top: 4, bottom: 24),
              children: [
                Panel(children: [for (final r in rows) _BoardTile(r)]),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// A standings-style row: the rank numeral (podium metals) over its movement,
/// the name, and the points or lives on the far side. An eliminated player is
/// struck through and faded.
class _BoardTile extends StatelessWidget {
  const _BoardTile(this.row);
  final _BoardRow row;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final t = context.tokens;
    final out = row.isOut;
    final rank = row.rank;
    final rankColor = out
        ? t.faint
        : switch (rank) {
            1 => t.gold,
            2 => t.silver,
            3 => t.bronze,
            _ => t.muted,
          };
    final valueColor = out ? t.faint : scheme.onSurface;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          SizedBox(
            width: 36,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                rank != null
                    ? Text('$rank', style: t.score(24, color: rankColor))
                    : Icon(Icons.person_outline, size: 22, color: t.faint),
                MovementArrow(delta: row.movement),
              ],
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  row.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: out ? t.faint : null,
                    decoration: out ? TextDecoration.lineThrough : null,
                    decorationColor: t.faint,
                  ),
                ),
                if (row.eliminatedRound != null) ...[
                  const SizedBox(height: 4),
                  Tag(row.eliminatedRound!, color: t.live),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (row.totalPoints != null)
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${row.totalPoints}', style: t.score(26, color: valueColor)),
                Text(context.tr('leaderboard.pts'),
                    style: theme.textTheme.labelSmall?.copyWith(color: t.faint)),
              ],
            )
          else if (row.livesLeft != null)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(out ? Icons.favorite_border : Icons.favorite,
                    size: 18, color: out ? t.faint : t.live),
                const SizedBox(width: 6),
                Text('${row.livesLeft}', style: t.score(26, color: valueColor)),
              ],
            ),
        ],
      ),
    );
  }
}
