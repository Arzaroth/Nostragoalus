import 'package:flutter/material.dart';

/// Translation lookup, matching `BuildContext.tr`.
typedef Tr = String Function(String key, [Map<String, Object?>? vars]);

/// Per-type notification copy, mirroring the web `NotificationBell`
/// (`notifications.item.*`). Pure so every branch is unit-testable.
String notificationMessage(String type, Map<String, dynamic> data, Tr tr) {
  String item(String key) => tr('notifications.item.$key');
  final points = (data['points'] as num?) ?? 0;
  switch (type) {
    case 'LEAGUE_JOIN':
      return _fill(item('leagueJoin'), {'name': data['joinerName'], 'league': data['leagueName']});
    case 'LEAGUE_ROLE':
      return _fill(item(data['role'] == 'OWNER' ? 'leagueRoleOwner' : 'leagueRolePromoted'),
          {'league': data['leagueName']});
    case 'LEAGUE_REMOVED':
      return _fill(item('leagueRemoved'), {'league': data['leagueName']});
    case 'PICK_REMINDER':
      return _fill(item('pickReminder'), {'home': data['homeTeam'], 'away': data['awayTeam']});
    case 'MATCH_RESULT':
      return _fill(item(points > 0 ? 'matchResult' : 'matchResultMiss'), {
        'home': data['homeTeam'],
        'away': data['awayTeam'],
        'hs': data['homeScore'],
        'as': data['awayScore'],
        'points': data['points'],
      });
    case 'CHAMPION_RESULT':
      return _fill(item(data['won'] == true ? 'championWon' : 'championLost'), {
        'team': data['teamName'],
        'competition': data['competitionName'],
        'points': data['points'],
      });
    case 'BEST_SCORER_RESULT':
      return _fill(item(data['won'] == true ? 'bestScorerWon' : 'bestScorerLost'), {
        'player': data['playerName'],
        'competition': data['competitionName'],
        'points': data['points'],
      });
    case 'TROPHY_AWARDED':
      final trophyType = data['trophyType'];
      final trophy = trophyType == 'TEAM_SPECIALIST'
          ? (data['teamName'] != null
              ? _fill(tr('achievements.trophy.TEAM_SPECIALIST.name'), {'team': data['teamName']})
              : tr('achievements.trophy.TEAM_SPECIALIST_GENERIC.name'))
          : tr('achievements.trophy.$trophyType.name');
      return _fill(
          item('trophyAwarded'), {'trophy': trophy, 'competition': data['competitionName']});
    case 'ACHIEVEMENT_UNLOCKED':
      return _fill(item('achievementUnlocked'),
          {'achievement': tr('achievements.badge.${data['key']}.name')});
    case 'CHAT_MENTION':
      return data['matchId'] != null
          ? _fill(item('mentionMatch'), {
              'name': data['senderName'],
              'home': data['homeTeam'] ?? '',
              'away': data['awayTeam'] ?? '',
            })
          : _fill(item('mention'), {'name': data['senderName'], 'league': data['leagueName']});
    case 'DM_MESSAGE':
      return _fill(item('dm'), {'name': data['senderName']});
    case 'VOICE_MISSED':
      return data['leagueId'] != null
          ? _fill(item('voiceMissedLeague'),
              {'name': data['callerName'], 'league': data['leagueName'] ?? ''})
          : _fill(item('voiceMissed'), {'name': data['callerName']});
    default:
      return item('generic');
  }
}

IconData notificationIcon(String type, {required bool read}) =>
    _icons[type] ?? (read ? Icons.notifications_none : Icons.notifications_active);

/// `2026-07-19T21:04:00Z` -> `2026-07-19 21:04` in the device's zone. Anything
/// unparseable falls back to the raw string rather than blanking the row.
String formatNotificationDate(String iso) {
  final at = DateTime.tryParse(iso)?.toLocal();
  if (at == null) return iso;
  String two(int v) => v.toString().padLeft(2, '0');
  return '${at.year}-${two(at.month)}-${two(at.day)} ${two(at.hour)}:${two(at.minute)}';
}

String _fill(String template, Map<String, Object?> vars) {
  var out = template;
  vars.forEach((k, v) => out = out.replaceAll('{$k}', '${v ?? ''}'));
  return out;
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
