import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/state/providers.dart';

/// The strings the league lens and the chat rooms list read.
const leagueStrings = {
  'common': {'retry': 'Retry'},
  'err': {'generic': 'Something went wrong'},
  'nav': {'chat': 'Chat', 'leagues': 'Leagues', 'competition': 'Competition'},
  'dm': {'title': 'Messages'},
  'chat': {
    'league': {'title': 'Leagues'},
  },
  'leagues': {'empty': 'No leagues yet', 'global': 'Everyone', 'pillLabel': 'League'},
};

/// One league as the API sends it. The single source for both the widget tests
/// and the provider tests, so a new required field in `models.gen.dart` breaks
/// in one place instead of two.
Map<String, dynamic> leagueJson(
  String id,
  String name, {
  String competition = 'wc26',
  bool chatEnabled = true,
}) =>
    {
      'id': id,
      'name': name,
      'competition': {'id': 'c-$competition', 'slug': competition, 'name': 'Comp $competition'},
      'mode': 'NORMAL',
      'role': 'MEMBER',
      'visibility': 'PRIVATE',
      'picksSynced': false,
      'chatEnabled': chatEnabled,
      'memberCount': 3,
    };

LeaguesResponseLeague leagueFixture(
  String id,
  String name, {
  String competition = 'wc26',
  bool chatEnabled = true,
}) =>
    LeaguesResponseLeague.fromJson(
        leagueJson(id, name, competition: competition, chatEnabled: chatEnabled));

Override leaguesOverride(List<LeaguesResponseLeague> leagues) =>
    leaguesProvider.overrideWith((ref) async => LeaguesResponse(leagues: leagues));
