import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';

import 'build_client.dart';
import 'helpers.dart';

void main() {
  group('mints', () {
    test('mintAnalyticsShare posts the competition and returns the token', () async {
      final (api, adapter) =
          buildApi([Reply(200, const {'token': 'tk', 'url': 'u', 'imageUrl': 'i'})]);

      expect(await api.mintAnalyticsShare(competition: 'wc'), 'tk');
      expectRequest(adapter,
          method: 'POST',
          path: '/api/share/analytics-mint',
          body: {'competition': 'wc'});
    });

    test('mintAnalyticsShare posts an empty body without a competition', () async {
      final (api, adapter) =
          buildApi([Reply(200, const {'token': 'tk', 'url': 'u', 'imageUrl': 'i'})]);

      await api.mintAnalyticsShare();
      expectRequest(adapter,
          method: 'POST', path: '/api/share/analytics-mint', body: const <String, dynamic>{});
    });

    test('mintWrappedShare returns the image URL, not a token', () async {
      final (api, adapter) =
          buildApi([Reply(200, const {'token': 'tk', 'imageUrl': 'https://x/y.png'})]);

      expect(await api.mintWrappedShare(competition: 'wc'), 'https://x/y.png');
      expectRequest(adapter,
          method: 'POST', path: '/api/share/wrapped-mint', body: {'competition': 'wc'});
    });

    // A missing key used to stringify into the literal "null" inside the URL.
    test('mintWrappedShare refuses a body without an image URL', () async {
      final (api, _) = buildApi([Reply(200, const {'token': 'tk'})]);
      await expectLater(api.mintWrappedShare(), throwsA(isA<TypeError>()));
    });

    test('mintProfileShare returns the token', () async {
      final (api, adapter) =
          buildApi([Reply(200, const {'token': 'pk', 'url': 'u', 'imageUrl': 'i'})]);

      expect(await api.mintProfileShare(), 'pk');
      expectRequest(adapter,
          method: 'POST', path: '/api/share/profile-mint', body: const <String, dynamic>{});
    });

    test('mintProfileShare refuses a body without a token', () async {
      final (api, _) = buildApi([Reply(200, const {'url': 'u', 'imageUrl': 'i'})]);
      await expectLater(api.mintProfileShare(), throwsA(isA<TypeError>()));
    });

    test('a mint failure surfaces as an ApiException', () async {
      final (api, _) = buildFailing(429);
      await expectLater(api.mintAnalyticsShare(), throwsStatus(429));
    });
  });

  group('shareCard picks the endpoint from the kind', () {
    Future<String> pathFor(String kind) async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'card': {'title': 'T'},
        }),
      ]);
      await api.shareCard(kind, 'tok');
      return adapter.requests.single.path;
    }

    test('a reads the analytics card', () async {
      expect(await pathFor('a'), '/api/share/analytics/tok');
    });

    test('p reads the profile card', () async {
      expect(await pathFor('p'), '/api/share/profile/tok');
    });

    test('anything else reads the pick card', () async {
      expect(await pathFor('s'), '/api/share/tok');
    });

    test('the card object comes back cast to a string map', () async {
      final (api, _) = buildApi([
        Reply(200, const {
          'card': {'title': 'T', 'points': 12},
        }),
      ]);

      expect(await api.shareCard('a', 'tok'), {'title': 'T', 'points': 12});
    });

    test('a body with no card yields an empty map, not a crash', () async {
      final (api, _) = buildApi([Reply(200, const {'card': null})]);
      expect(await api.shareCard('a', 'tok'), isEmpty);
    });

    test('an expired token surfaces as an ApiException', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.shareCard('a', 'gone'), throwsStatus(404));
    });
  });
}
