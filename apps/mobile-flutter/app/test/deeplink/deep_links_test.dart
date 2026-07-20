import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/deeplink/deep_links.dart';
import 'package:nostragoalus/ui/join_league_screen.dart';
import 'package:nostragoalus/ui/league_detail_screen.dart';
import 'package:nostragoalus/ui/match_detail_screen.dart';
import 'package:nostragoalus/ui/share_card_screen.dart';

void main() {
  test('share cards route while signed out', () {
    expect(deepLinkTarget(const ['a', 'tok'], signedIn: false), isNotNull);
    expect(deepLinkTarget(const ['p', 'tok'], signedIn: false), isNotNull);
    expect(deepLinkTarget(const ['s', 'tok'], signedIn: false), isNotNull);
  });

  test('everything else is dropped without a session', () {
    expect(deepLinkTarget(const ['leagues', 'l1'], signedIn: false), isNull);
    expect(deepLinkTarget(const ['leagues', 'join', 't1'], signedIn: false), isNull);
    expect(deepLinkTarget(const ['euro-2024', 'matches', 'm1'], signedIn: false), isNull);
  });

  test('/<competition>/matches/<id> routes, and only at that exact shape', () {
    expect(deepLinkTarget(const ['euro-2024', 'matches', 'm1'], signedIn: true), isNotNull);
    // The old indexOf('matches') scan routed any path containing the segment.
    expect(deepLinkTarget(const ['a1', 'b1', 'matches', 'm1'], signedIn: true), isNull);
    expect(deepLinkTarget(const ['matches', 'm1'], signedIn: true), isNull);
    expect(deepLinkTarget(const ['euro-2024', 'matches'], signedIn: true), isNull);
  });

  test('unknown and empty paths route nowhere', () {
    expect(deepLinkTarget(const <String>[], signedIn: true), isNull);
    expect(deepLinkTarget(const ['about'], signedIn: true), isNull);
    expect(deepLinkTarget(const ['nope', 'nope', 'nope'], signedIn: true), isNull);
  });

  testWidgets('each path builds its own screen, join before league detail',
      (tester) async {
    await tester.pumpWidget(const SizedBox());
    final ctx = tester.element(find.byType(SizedBox));
    Widget build(List<String> s, {bool signedIn = true}) =>
        deepLinkTarget(s, signedIn: signedIn)!.builder(ctx);

    expect(build(const ['s', 'tok'], signedIn: false), isA<ShareCardScreen>());
    // Ordering: /leagues/join/<token> must not be read as league id "join".
    expect(build(const ['leagues', 'join', 't1']), isA<JoinLeagueScreen>());
    expect(build(const ['leagues', 'l1']), isA<LeagueDetailScreen>());
    expect(build(const ['euro-2024', 'matches', 'm1']), isA<MatchDetailScreen>());
  });
}
