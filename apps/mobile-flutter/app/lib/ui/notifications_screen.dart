import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// In-app notification center. Marks everything read on open; push delivery
/// (FCM/APNs) is a separate, later slice.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifs = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('notifications.title')),
        actions: [
          IconButton(
            icon: const Icon(Icons.done_all),
            tooltip: context.tr('notifications.markAllRead'),
            onPressed: () async {
              await ref.read(apiProvider).markNotificationsRead(all: true);
              ref.invalidate(notificationsProvider);
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(notificationsProvider.future),
        child: AsyncValueView<NotificationsResponse>(
          value: notifs,
          onRetry: () => ref.invalidate(notificationsProvider),
          data: (res) => res.notifications.isEmpty
              ? ListView(children: [
                  const SizedBox(height: 80),
                  Center(child: Text(context.tr('notifications.empty'))),
                ])
              : ListView.separated(
                  itemCount: res.notifications.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) => _Tile(res.notifications[i]),
                ),
        ),
      ),
    );
  }
}

String _humanise(String enumCode) {
  final words = enumCode.toLowerCase().split('_');
  return words.map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');
}

String _fill(String tmpl, Map<String, dynamic> vars) {
  var s = tmpl;
  vars.forEach((k, v) => s = s.replaceAll('{$k}', '${v ?? ''}'));
  return s;
}

/// Reproduces the web NotificationBell per-type templates (i18n
/// `notifications.item.*`) from the notification's typed data payload.
String _message(BuildContext c, NotificationData n) {
  final d = n.data;
  String item(String k) => c.tr('notifications.item.$k');
  final points = (d['points'] as num?) ?? 0;
  switch (n.type) {
    case 'LEAGUE_JOIN':
      return _fill(item('leagueJoin'), {'name': d['joinerName'], 'league': d['leagueName']});
    case 'LEAGUE_ROLE':
      return _fill(item(d['role'] == 'OWNER' ? 'leagueRoleOwner' : 'leagueRolePromoted'),
          {'league': d['leagueName']});
    case 'LEAGUE_REMOVED':
      return _fill(item('leagueRemoved'), {'league': d['leagueName']});
    case 'PICK_REMINDER':
      return _fill(item('pickReminder'), {'home': d['homeTeam'], 'away': d['awayTeam']});
    case 'MATCH_RESULT':
      return _fill(item(points > 0 ? 'matchResult' : 'matchResultMiss'), {
        'home': d['homeTeam'],
        'away': d['awayTeam'],
        'hs': d['homeScore'],
        'as': d['awayScore'],
        'points': d['points'],
      });
    case 'CHAMPION_RESULT':
      return _fill(item(d['won'] == true ? 'championWon' : 'championLost'),
          {'team': d['teamName'], 'competition': d['competitionName'], 'points': d['points']});
    case 'BEST_SCORER_RESULT':
      return _fill(item(d['won'] == true ? 'bestScorerWon' : 'bestScorerLost'),
          {'player': d['playerName'], 'competition': d['competitionName'], 'points': d['points']});
    case 'TROPHY_AWARDED':
      final tt = d['trophyType'];
      final trophy = tt == 'TEAM_SPECIALIST'
          ? (d['teamName'] != null
              ? _fill(c.tr('achievements.trophy.TEAM_SPECIALIST.name'), {'team': d['teamName']})
              : c.tr('achievements.trophy.TEAM_SPECIALIST_GENERIC.name'))
          : c.tr('achievements.trophy.$tt.name');
      return _fill(item('trophyAwarded'), {'trophy': trophy, 'competition': d['competitionName']});
    case 'ACHIEVEMENT_UNLOCKED':
      return _fill(item('achievementUnlocked'),
          {'achievement': c.tr('achievements.badge.${d['key']}.name')});
    case 'CHAT_MENTION':
      return d['matchId'] != null
          ? _fill(item('mentionMatch'),
              {'name': d['senderName'], 'home': d['homeTeam'] ?? '', 'away': d['awayTeam'] ?? ''})
          : _fill(item('mention'), {'name': d['senderName'], 'league': d['leagueName']});
    case 'DM_MESSAGE':
      return _fill(item('dm'), {'name': d['senderName']});
    case 'VOICE_MISSED':
      return d['leagueId'] != null
          ? _fill(item('voiceMissedLeague'),
              {'name': d['callerName'], 'league': d['leagueName'] ?? ''})
          : _fill(item('voiceMissed'), {'name': d['callerName']});
    default:
      return _humanise(n.type);
  }
}

const _icons = <String, IconData>{
  'LEAGUE_JOIN': Icons.person_add,
  'LEAGUE_ROLE': Icons.shield,
  'LEAGUE_REMOVED': Icons.person_remove,
  'PICK_REMINDER': Icons.schedule,
  'MATCH_RESULT': Icons.flag,
  'CHAMPION_RESULT': Icons.emoji_events,
  'BEST_SCORER_RESULT': Icons.sports_soccer,
  'TROPHY_AWARDED': Icons.workspace_premium,
  'ACHIEVEMENT_UNLOCKED': Icons.verified,
  'CHAT_MENTION': Icons.alternate_email,
  'DM_MESSAGE': Icons.mail,
  'VOICE_MISSED': Icons.call_missed,
};

class _Tile extends StatelessWidget {
  const _Tile(this.n);
  final NotificationData n;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(_icons[n.type] ?? (n.read ? Icons.notifications_none : Icons.notifications_active),
          color: n.read ? null : Theme.of(context).colorScheme.primary),
      title: Text(_message(context, n)),
      subtitle: Text(n.createdAt),
    );
  }
}
