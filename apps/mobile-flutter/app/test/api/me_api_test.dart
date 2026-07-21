import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';

import 'build_client.dart';
import 'helpers.dart';

void main() {
  group('competition-scoped reads carry the selected competition', () {
    test('meStats sends it and omits it when null', () async {
      final (scoped, scopedAdapter) = buildApi([Reply(200, const {'stats': null})]);
      await scoped.meStats(competition: 'wc26');
      expectRequest(scopedAdapter,
          method: 'GET', path: '/api/me/stats', query: {'competition': 'wc26'});

      final (plain, plainAdapter) = buildApi([Reply(200, const {'stats': null})]);
      final res = await plain.meStats();
      expect(res.stats, isNull);
      expectRequest(plainAdapter, method: 'GET', path: '/api/me/stats');
    });

    test('meStats parses the counters', () async {
      final (api, _) = buildApi([
        Reply(200, const {
          'stats': {
            'rank': 3,
            'players': 20,
            'totalPoints': 42,
            'exact': 2,
            'outcome': 5,
            'predictions': 9,
            'jokers': 1,
          },
        }),
      ]);

      final res = await api.meStats();
      expect(res.stats!.rank, 3);
      expect(res.stats!.totalPoints, 42);
    });

    test('analytics sends the competition', () async {
      final (api, adapter) = buildFailing(404);
      await expectLater(api.analytics(competition: 'euro'), throwsStatus(404));
      expectRequest(adapter,
          method: 'GET', path: '/api/me/analytics', query: {'competition': 'euro'});
    });

    test('wrapped sends the competition and returns the raw oneOf body', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'ready': false, 'competitionName': 'WC'}),
      ]);

      expect(await api.wrapped(competition: 'wc26'), {'ready': false, 'competitionName': 'WC'});
      expectRequest(adapter,
          method: 'GET', path: '/api/me/wrapped', query: {'competition': 'wc26'});
    });

    test('cabinet sends the competition alongside the user id', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'userId': 'u1',
          'displayName': 'A',
          'isOwner': true,
          'trophies': [],
          'achievements': [],
          'showcase': [],
        }),
      ]);

      final res = await api.cabinet('u1', competition: 'wc26');
      expect(res.displayName, 'A');
      expect(res.isOwner, isTrue);
      expectRequest(adapter,
          method: 'GET', path: '/api/users/u1/cabinet', query: {'competition': 'wc26'});
    });
  });

  group('reads', () {
    test('headToHead sends both players and the competition', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'a': {}, 'b': {}}),
      ]);

      await api.headToHead('u1', 'u2', competition: 'wc26');

      expectRequest(adapter, method: 'GET', path: '/api/head-to-head', query: {
        'a': 'u1',
        'b': 'u2',
        'competition': 'wc26',
      });
    });

    test('headToHead omits an unset competition', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'a': {}, 'b': {}}),
      ]);

      await api.headToHead('u1', 'u2');

      expectRequest(adapter,
          method: 'GET', path: '/api/head-to-head', query: {'a': 'u1', 'b': 'u2'});
    });

    test('notifications parses the list and the unread count', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'notifications': [], 'unreadCount': 3}),
      ]);

      final res = await api.notifications();
      expect(res.unreadCount, 3);
      expectRequest(adapter, method: 'GET', path: '/api/notifications');
    });

    test('roadmap parses the items', () async {
      final (api, adapter) = buildApi([
        Reply(200, {
          'items': [
            {
              'id': 'r1',
              'title': 'Dark mode',
              'description': null,
              'status': 'PLANNED',
              'position': 1,
              'voteCount': 7,
              'viewerHasVoted': false,
              'underReview': false,
              'updatedAt': DateTime.utc(2026).toIso8601String(),
            },
          ],
        }),
      ]);

      final res = await api.roadmap();
      expect(res.items.single.title, 'Dark mode');
      expect(res.items.single.voteCount, 7);
      expectRequest(adapter, method: 'GET', path: '/api/roadmap');
    });

    test('notifications throws rather than showing an empty bell', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.notifications(), throwsStatus(500));
    });

    test('roadmap throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.roadmap(), throwsStatus(500));
    });

    test('cabinet throws on a non-2xx', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.cabinet('u1'), throwsStatus(404));
    });

    test('wrapped throws on a non-2xx', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.wrapped(), throwsStatus(404));
    });

    test('headToHead throws on a non-2xx', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.headToHead('u1', 'u2'), throwsStatus(404));
    });
  });

  group('mutations', () {
    test('markNotificationsRead sends all: true when asked for all', () async {
      final (api, adapter) = buildApi([Reply(200, const {'marked': 4})]);

      await api.markNotificationsRead(all: true, ids: const ['ignored']);

      expectRequest(adapter,
          method: 'POST', path: '/api/notifications/read', body: {'all': true});
    });

    test('markNotificationsRead sends the ids otherwise', () async {
      final (api, adapter) = buildApi([Reply(200, const {'marked': 1})]);

      await api.markNotificationsRead(ids: const ['n1']);

      expectRequest(adapter, method: 'POST', path: '/api/notifications/read', body: {
        'ids': ['n1'],
      });
    });

    test('markNotificationsRead sends an empty id list when given none', () async {
      final (api, adapter) = buildApi([Reply(200, const {'marked': 0})]);

      await api.markNotificationsRead();

      expectRequest(adapter, method: 'POST', path: '/api/notifications/read', body: {
        'ids': <String>[],
      });
    });

    test('updatePrefs posts the preference map verbatim', () async {
      final (api, adapter) = buildApi([Reply(200, const {'status': true})]);

      await api.updatePrefs(const {'theme': 'dark', 'showOdds': true});

      expectRequest(adapter, method: 'POST', path: '/api/auth/update-user', body: {
        'theme': 'dark',
        'showOdds': true,
      });
    });

    test('updateProfile sends only the fields that were given', () async {
      final (api, adapter) = buildApi([Reply(200, const {'status': true})]);

      await api.updateProfile(name: 'New');

      expectRequest(adapter,
          method: 'POST', path: '/api/auth/update-user', body: {'name': 'New'});
    });

    test('updateProfile sends the avatar data URL', () async {
      final (api, adapter) = buildApi([Reply(200, const {'status': true})]);

      await api.updateProfile(imageDataUrl: 'data:image/webp;base64,AA');

      expectRequest(adapter, method: 'POST', path: '/api/auth/update-user', body: {
        'image': 'data:image/webp;base64,AA',
      });
    });

    test('sendVerificationEmail pins the callback URL', () async {
      final (api, adapter) = buildApi([Reply(200, const {'status': true})]);

      await api.sendVerificationEmail('a@b.tld');

      expectRequest(adapter,
          method: 'POST',
          path: '/api/auth/send-verification-email',
          body: {'email': 'a@b.tld', 'callbackURL': '/verify-email'});
    });

    test('dismissOnboardingTour posts with no body', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.dismissOnboardingTour();

      expectRequest(adapter, method: 'POST', path: '/api/me/onboarding-tour');
      expect(adapter.requests.single.data, isNull);
    });

    test('voteRoadmap posts to the item', () async {
      final (api, adapter) = buildApi([Reply(200, const {'voteCount': 8})]);

      await api.voteRoadmap('r1');

      expectRequest(adapter, method: 'POST', path: '/api/roadmap/r1/vote');
    });

    test('suggestRoadmap posts the title and description', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'item': {}}),
      ]);

      await api.suggestRoadmap('Title', 'Body');

      expectRequest(adapter, method: 'POST', path: '/api/roadmap/suggestions', body: {
        'title': 'Title',
        'description': 'Body',
      });
    });

    test('a rate-limited suggestion surfaces as an ApiException', () async {
      final (api, _) = buildFailing(429);
      await expectLater(api.suggestRoadmap('T', 'B'), throwsStatus(429));
    });

    test('voteRoadmap surfaces a failure', () async {
      final (api, _) = buildFailing(409);
      await expectLater(api.voteRoadmap('r1'), throwsStatus(409));
    });

    test('updatePrefs surfaces a failure', () async {
      final (api, _) = buildFailing(401);
      await expectLater(api.updatePrefs(const {'theme': 'dark'}), throwsStatus(401));
    });

    test('updateProfile surfaces a failure', () async {
      final (api, _) = buildFailing(413);
      await expectLater(api.updateProfile(name: 'x'), throwsStatus(413));
    });

    test('sendVerificationEmail surfaces a failure', () async {
      final (api, _) = buildFailing(429);
      await expectLater(api.sendVerificationEmail('a@b.tld'), throwsStatus(429));
    });

    test('dismissOnboardingTour surfaces a failure', () async {
      final (api, _) = buildFailing(401);
      await expectLater(api.dismissOnboardingTour(), throwsStatus(401));
    });

    test('markNotificationsRead surfaces a failure', () async {
      final (api, _) = buildFailing(401);
      await expectLater(api.markNotificationsRead(all: true), throwsStatus(401));
    });

    test('setShowcase surfaces a rejected showcase', () async {
      final (api, _) = buildFailing(422);
      await expectLater(api.setShowcase(const ['a']), throwsStatus(422));
    });

    test('setShowcase omits an unset competition', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.setShowcase(const ['a']);

      expectRequest(adapter, method: 'PUT', path: '/api/showcase', body: {
        'items': [
          {'achievementKey': 'a'},
        ],
      });
    });
  });
}
