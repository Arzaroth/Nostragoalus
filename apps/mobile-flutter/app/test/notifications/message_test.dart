import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/notifications/message.dart';

/// Records every key looked up and echoes it, so each branch is asserted on the
/// i18n key it picked rather than on English copy.
class _Recorder {
  final keys = <String>[];
  String call(String key, [Map<String, Object?>? vars]) {
    keys.add(key);
    return '<$key>';
  }
}

late _Recorder _tr;
String _msg(String type, Map<String, dynamic> data) =>
    notificationMessage(type, data, _tr.call);
String _item(String key) => '<notifications.item.$key>';

void main() {
  setUp(() => _tr = _Recorder());

  test('LEAGUE_JOIN', () {
    expect(_msg('LEAGUE_JOIN', {'joinerName': 'Sam', 'leagueName': 'Aces'}), _item('leagueJoin'));
  });

  test('LEAGUE_ROLE picks owner vs promoted', () {
    expect(_msg('LEAGUE_ROLE', {'role': 'OWNER'}), _item('leagueRoleOwner'));
    expect(_msg('LEAGUE_ROLE', {'role': 'MODERATOR'}), _item('leagueRolePromoted'));
  });

  test('LEAGUE_REMOVED', () => expect(_msg('LEAGUE_REMOVED', {}), _item('leagueRemoved')));

  test('PICK_REMINDER', () => expect(_msg('PICK_REMINDER', {}), _item('pickReminder')));

  test('MATCH_RESULT splits on points scored', () {
    expect(_msg('MATCH_RESULT', {'points': 3}), _item('matchResult'));
    expect(_msg('MATCH_RESULT', {'points': 0}), _item('matchResultMiss'));
    expect(_msg('MATCH_RESULT', const <String, dynamic>{}), _item('matchResultMiss'));
  });

  test('CHAMPION_RESULT splits on won', () {
    expect(_msg('CHAMPION_RESULT', {'won': true}), _item('championWon'));
    expect(_msg('CHAMPION_RESULT', {'won': false}), _item('championLost'));
  });

  test('BEST_SCORER_RESULT splits on won', () {
    expect(_msg('BEST_SCORER_RESULT', {'won': true}), _item('bestScorerWon'));
    expect(_msg('BEST_SCORER_RESULT', {'won': false}), _item('bestScorerLost'));
  });

  test('TROPHY_AWARDED resolves the trophy name, generic when the team is unknown', () {
    expect(_msg('TROPHY_AWARDED', {'trophyType': 'OVERALL'}), _item('trophyAwarded'));
    expect(_tr.keys, contains('achievements.trophy.OVERALL.name'));

    _msg('TROPHY_AWARDED', {'trophyType': 'TEAM_SPECIALIST', 'teamName': 'Brazil'});
    expect(_tr.keys, contains('achievements.trophy.TEAM_SPECIALIST.name'));

    _msg('TROPHY_AWARDED', {'trophyType': 'TEAM_SPECIALIST'});
    expect(_tr.keys, contains('achievements.trophy.TEAM_SPECIALIST_GENERIC.name'));
  });

  test('ACHIEVEMENT_UNLOCKED looks the badge name up', () {
    expect(_msg('ACHIEVEMENT_UNLOCKED', {'key': 'OPENER'}), _item('achievementUnlocked'));
    expect(_tr.keys, contains('achievements.badge.OPENER.name'));
  });

  test('CHAT_MENTION splits on match vs league', () {
    expect(_msg('CHAT_MENTION', {'matchId': 'm1', 'senderName': 'Sam'}), _item('mentionMatch'));
    expect(_msg('CHAT_MENTION', {'senderName': 'Sam'}), _item('mention'));
  });

  test('DM_MESSAGE', () => expect(_msg('DM_MESSAGE', {'senderName': 'Sam'}), _item('dm')));

  test('VOICE_MISSED splits on league', () {
    expect(_msg('VOICE_MISSED', {'leagueId': 'l1'}), _item('voiceMissedLeague'));
    expect(_msg('VOICE_MISSED', {}), _item('voiceMissed'));
  });

  test('an unknown type falls back to generic copy, never a raw enum code', () {
    expect(_msg('SOMETHING_NEW', {}), _item('generic'));
  });

  test('vars are substituted into the template', () {
    String template(String key, [Map<String, Object?>? vars]) => '{name} joined {league}';
    expect(
      notificationMessage('LEAGUE_JOIN', {'joinerName': 'Sam', 'leagueName': 'Aces'}, template),
      'Sam joined Aces',
    );
  });

  test('a missing var renders empty, not "null"', () {
    String template(String key, [Map<String, Object?>? vars]) => '[{name}]';
    expect(notificationMessage('DM_MESSAGE', const {}, template), '[]');
  });

  test('icons are per type, with a read/unread fallback', () {
    expect(notificationIcon('DM_MESSAGE', read: false), Icons.mail);
    expect(notificationIcon('NOPE', read: true), Icons.notifications_none);
    expect(notificationIcon('NOPE', read: false), Icons.notifications_active);
  });

  test('createdAt renders as a local date-time, unparseable input untouched', () {
    expect(formatNotificationDate('2026-07-19T21:04:00Z'),
        matches(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$'));
    expect(formatNotificationDate('nope'), 'nope');
  });
}
