import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/models.gen.dart';

void main() {
  test('CompetitionsResponse parses a nested list', () {
    final r = CompetitionsResponse.fromJson({
      'competitions': [
        {'id': 'wc', 'slug': 'world-cup', 'name': 'World Cup'},
        {'id': 'eu', 'slug': 'euro', 'name': 'Euro'},
      ],
    });

    expect(r.competitions, hasLength(2));
    expect(r.competitions.first.slug, 'world-cup');
    expect(r.competitions.last.name, 'Euro');
  });

  test('PredictionInput round-trips through JSON', () {
    const input = PredictionInput(home: 2, away: 1, isOutcomeOnly: false, wager: 3);
    final round = PredictionInput.fromJson(input.toJson());

    expect(round.home, 2);
    expect(round.away, 1);
    expect(round.isOutcomeOnly, false);
    expect(round.wager, 3);
  });

  // The server's zod tells optional apart from nullable and 400s on an explicit
  // null for a plain `.optional()`, so the two must not encode alike.
  test('PredictionInput omits an optional field but emits a nullable one', () {
    const input = PredictionInput(home: 0, away: 0);
    final json = input.toJson();

    expect(json['home'], 0);
    // isOutcomeOnly is z.boolean().optional() - the key must be absent.
    expect(json.containsKey('isOutcomeOnly'), isFalse);
    // wager is z.number().nullable().optional() - null is a meaningful value
    // (it clears the stake), so the key stays.
    expect(json.containsKey('wager'), isTrue);
    expect(json['wager'], isNull);
  });

  test('CreateLeagueInput omits every unset optional field', () {
    final json = const CreateLeagueInput(competition: 'wc', name: 'Mine').toJson();

    expect(json, {'competition': 'wc', 'name': 'Mine'});
  });

  test('a closed value set becomes a real enum, unknown values included', () {
    expect(ModeValue.values.map((e) => e.wire), containsAll(['NORMAL', 'HARDCORE']));
    expect(VisibilityValue.values.map((e) => e.wire), ['PRIVATE', 'PUBLIC', '']);
    // A value this build never heard of degrades instead of throwing.
    expect(ModeValue.from('SUDDEN_DEATH'), ModeValue.unknown);
    expect(ModeValue.from(null), ModeValue.unknown);
    expect(ModeValue.from('HARDCORE'), ModeValue.hardcore);
  });

  test('an enum field round-trips through its wire value', () {
    const input = CreateLeagueInput(
        competition: 'wc', name: 'Mine', mode: ModeValue.hardcore, lives: 3);
    expect(input.toJson()['mode'], 'HARDCORE');
    expect(CreateLeagueInput.fromJson(input.toJson()).mode, ModeValue.hardcore);
  });

  test('MatchTimelineResponse parses the event list', () {
    final r = MatchTimelineResponse.fromJson({
      'events': [
        {
          'kind': 'goal',
          'side': 'HOME',
          'minute': "23'",
          'playerName': 'A',
          'playerInName': null,
          'playerOutName': null,
          'periodKind': null,
          'text': null,
          'homeScore': 1,
          'awayScore': 0,
        },
      ],
    });

    expect(r.events.single.kind, 'goal');
    expect(r.events.single.homeScore, 1);
    expect(r.events.single.playerOutName, isNull);
  });

  test('TrustStatusResponse parses a scalar', () {
    expect(TrustStatusResponse.fromJson({'trusted': true}).trusted, isTrue);
  });

  test('MatchLiveDetailResponse parses a normalized provider payload', () {
    final r = MatchLiveDetailResponse.fromJson({
      'detail': {
        'minute': "47'",
        'halfTime': false,
        'possessionHome': 61,
        'possessionAway': 39,
        'attendance': 68000,
        'stadium': 'Wembley',
        'cards': {
          'home': {'yellow': 2, 'red': 0},
          'away': {'yellow': 1, 'red': 1},
        },
        'goals': [
          {
            'side': 'HOME',
            'teamId': 't1',
            'teamName': 'England',
            'teamCode': 'ENG',
            'playerId': 'p1',
            'playerName': 'KANE',
            'minute': "23'",
            'goalType': 1,
            'ownGoal': false,
            'assistPlayerId': null,
            'assistPlayerName': null,
          },
        ],
        'bookings': [
          {
            'side': 'AWAY',
            'playerId': 'p9',
            'playerName': 'COACH',
            'minute': "60'",
            'card': 'YELLOW',
            'coach': true,
          },
        ],
        'substitutions': [
          {
            'side': 'HOME',
            'minute': "70'",
            'playerOffId': 'p1',
            'playerOffName': 'KANE',
            'playerOnId': 'p2',
            'playerOnName': 'FODEN',
          },
        ],
        'playerNames': {'p1': 'KANE'},
        'ifesId': '133016',
        'homeTeamId': 't1',
        'awayTeamId': 't2',
        'stats': {
          'home': {
            'possession': 61,
            'attempts': 14,
            'onTarget': 5,
            'passes': 500,
            'passesCompleted': 450,
            'crosses': 12,
            'corners': 6,
            'fouls': 8,
            'offsides': 1,
            'distanceKm': 110,
            'pressuresApplied': 90,
            'forcedTurnovers': 20,
          },
          'away': null,
        },
      },
    });

    final d = r.detail!;
    expect(d.stadium, 'Wembley');
    expect(d.cards.home.yellow, 2);
    expect(d.goals.single.playerName, 'KANE');
    expect(d.bookings.single.card, CardValue.yellow);
    expect(d.substitutions.single.playerOnName, 'FODEN');
    expect(d.playerNames, {'p1': 'KANE'});
    expect(d.stats!.home!.passesCompleted, 450);
    expect(d.stats!.away, isNull);
  });

  test('MatchLiveDetailResponse tolerates a provider with nothing to say', () {
    expect(MatchLiveDetailResponse.fromJson(const {'detail': null}).detail, isNull);
  });

  test('MatchLiveDetailResponse throws on a malformed detail rather than half-parsing', () {
    expect(
        () => MatchLiveDetailResponse.fromJson(const {
              'detail': {'stadium': 'Wembley'},
            }),
        throwsA(isA<TypeError>()));
  });

  test('ChatAttachmentResponse parses the ciphertext envelope', () {
    final a = ChatAttachmentResponse.fromJson(const {'ciphertext': 'AAA', 'epoch': 3});
    expect(a.ciphertext, 'AAA');
    expect(a.epoch.toInt(), 3);
    expect(() => ChatAttachmentResponse.fromJson(const {'epoch': 3}), throwsA(isA<TypeError>()));
  });

  test('a chat message carries the author metadata and reaction totals', () {
    final m = ChatMessagesResponse.fromJson(const {
      'messages': [
        {
          'id': 'm1',
          'leagueId': 'l1',
          'matchId': null,
          'parentId': null,
          'threadId': null,
          'userId': 'u1',
          'authorName': 'Departed',
          'authorImage': 'https://cdn/x.png',
          'epoch': 1,
          'ciphertext': 'ct',
          'createdAt': '2026-07-01T10:00:00.000Z',
          'editedAt': null,
          'attachments': [],
          'moderation': 'VISIBLE',
          'reported': false,
          'reactions': {'FIRE': 2, 'GOAL': 0, 'WOW': 0, 'LAUGH': 0, 'SAD': 0, 'ANGRY': 0},
          'myReaction': 'FIRE',
          'threadCount': 0,
        },
      ],
      'readMarker': null,
    }).messages.single;

    expect(m.authorName, 'Departed');
    expect(m.authorImage, 'https://cdn/x.png');
    expect(m.reactions.fire.toInt(), 2);
    expect(m.myReaction, MineValue.fire);
    expect(m.moderation, ModerationValue.visible);
  });
}
