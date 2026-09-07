import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/state/providers.dart';

/// The strings the league lens and the chat rooms list read.
const leagueStrings = {
  'common': {'retry': 'Retry'},
  'err': {'generic': 'Something went wrong'},
  'nav': {'chat': 'Chat', 'leagues': 'Leagues'},
  'dm': {'title': 'Messages'},
  'chat': {
    'league': {'title': 'Leagues'},
  },
  'leagues': {'empty': 'No leagues yet', 'global': 'Everyone', 'pillLabel': 'League'},
};

LeaguesResponseLeague leagueFixture(String id, String name) =>
    LeaguesResponseLeague.fromJson({
      'id': id,
      'name': name,
      'competition': {'id': 'c1', 'slug': 'wc26', 'name': 'World Cup 26'},
      'mode': 'NORMAL',
      'role': 'MEMBER',
      'visibility': 'PRIVATE',
      'picksSynced': false,
      'chatEnabled': true,
      'memberCount': 3,
    });

Override leaguesOverride(List<LeaguesResponseLeague> leagues) =>
    leaguesProvider.overrideWith((ref) async => LeaguesResponse(leagues: leagues));
