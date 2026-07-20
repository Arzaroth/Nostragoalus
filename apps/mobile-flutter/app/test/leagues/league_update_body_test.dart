import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/ui/league_settings_screen.dart';

LeagueDetailResponseLeague _league({
  String name = 'Aces',
  String mode = 'NORMAL',
  String visibility = 'PRIVATE',
  double? lives,
  String? description,
}) =>
    LeagueDetailResponseLeague.fromJson({
      'id': 'l1',
      'name': name,
      'visibility': visibility,
      'description': description,
      'mode': mode,
      'lives': lives,
      'role': 'OWNER',
      'memberCount': 3,
    });

LeagueEdit _edit(
  LeagueDetailResponseLeague l, {
  String? name,
  String? mode,
  String? visibility,
  int? lives,
  String? description,
  String? featuredTeamCode,
}) =>
    LeagueEdit(
      name: name ?? l.name,
      visibility: visibility ?? l.visibility,
      mode: mode ?? l.mode,
      lives: lives ?? (l.lives ?? 3).toInt(),
      description: description ?? (l.description ?? ''),
      featuredTeamCode: featuredTeamCode,
    );

void main() {
  test('NORMAL -> HARDCORE always carries lives (the server rejects it without)', () {
    final l = _league();
    final body = leagueUpdateBody(l, _edit(l, mode: 'HARDCORE'));
    expect(body, {'mode': 'HARDCORE', 'lives': 3});
  });

  test('a lives change on an already-HARDCORE league is sent alone', () {
    final l = _league(mode: 'HARDCORE', lives: 3);
    expect(leagueUpdateBody(l, _edit(l, lives: 5)), {'lives': 5});
  });

  test('non-HARDCORE modes never send lives (the server forces null)', () {
    final l = _league(mode: 'HARDCORE', lives: 3);
    final body = leagueUpdateBody(l, _edit(l, mode: 'EASY', lives: 7));
    expect(body, {'mode': 'EASY'});
  });

  test('a no-op save sends nothing', () {
    final l = _league(mode: 'HARDCORE', lives: 3, description: 'hi');
    expect(leagueUpdateBody(l, _edit(l)), isEmpty);
  });

  test('a renamed league sends the trimmed name, short or not', () {
    final l = _league();
    expect(leagueUpdateBody(l, _edit(l, name: '  ab  ')), {'name': 'ab'});
  });

  test('clearing the description sends null, an untouched featured team nothing', () {
    final l = _league(description: 'old');
    expect(leagueUpdateBody(l, _edit(l, description: '  ')), {'description': null});
    expect(
      leagueUpdateBody(l, _edit(l, description: 'old', featuredTeamCode: '')),
      {'featuredTeamCode': null},
    );
    expect(
      leagueUpdateBody(l, _edit(l, description: 'old', featuredTeamCode: 'FRA')),
      {'featuredTeamCode': 'FRA'},
    );
  });

  test('visibility changes travel on their own', () {
    final l = _league();
    expect(leagueUpdateBody(l, _edit(l, visibility: 'PUBLIC')), {'visibility': 'PUBLIC'});
  });
}
