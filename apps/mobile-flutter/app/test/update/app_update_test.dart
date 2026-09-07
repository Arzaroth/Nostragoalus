import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/update/app_update.dart';

AppRelease _release(String? version, {bool available = true, int? size, String? url}) =>
    AppRelease.fromJson({
      'available': available,
      'version': version,
      'sizeBytes': size,
      'sha256': version == null ? null : 'deadbeef',
      'downloadUrl': url,
    });

void main() {
  group('isNewerVersion', () {
    // The reason this is not a string compare: "4.10.0" < "4.9.0" as text, so
    // everybody on the newest build would be told they are up to date.
    test('orders numerically, not as strings', () {
      expect(isNewerVersion('4.10.0', '4.9.0'), isTrue);
      expect(isNewerVersion('4.9.0', '4.10.0'), isFalse);
      expect(isNewerVersion('0.1.10', '0.1.9'), isTrue);
    });

    test('an identical version is not newer', () {
      expect(isNewerVersion('4.9.0', '4.9.0'), isFalse);
    });

    test('a missing segment counts as zero', () {
      expect(isNewerVersion('4.9', '4.9.0'), isFalse);
      expect(isNewerVersion('4.9.1', '4.9'), isTrue);
      expect(isNewerVersion('5', '4.99.99'), isTrue);
    });

    test('junk segments do not throw', () {
      expect(isNewerVersion('4.x.0', '4.0.0'), isFalse);
      expect(isNewerVersion('', 'dev'), isFalse);
    });
  });

  group('compareRelease', () {
    test('a newer published build carries its size, digest and download route', () {
      final r = compareRelease(
          _release('4.10.0', size: 94000000, url: '/download/x.apk'), '4.9.0');
      expect(r.state, UpdateState.newer);
      expect(r.version, '4.10.0');
      expect(r.sizeBytes, 94000000);
      expect(r.sha256, 'deadbeef');
      expect(r.path, '/download/x.apk');
    });

    // The server owns the download route; this is only a floor under a response
    // that did not carry one.
    test('falls back to the known path when the server sent no url', () {
      expect(compareRelease(_release('4.10.0'), '4.9.0').path, fallbackDownloadPath);
    });

    // `dev` parses as 0, so comparing it would tell every developer build - which
    // is usually AHEAD of the published one - that it is behind.
    test('an unstamped build is not compared at all', () {
      expect(compareRelease(_release('4.10.0'), 'dev').state, UpdateState.unversioned);
      expect(compareRelease(_release(null, available: false), 'dev').state,
          UpdateState.unversioned);
    });

    test('the same build is current', () {
      expect(compareRelease(_release('4.9.0'), '4.9.0').state, UpdateState.current);
    });

    // A local build ahead of the published one (the developer's own phone) is
    // not "newer available"; it is just not behind.
    test('a build ahead of the published one is current', () {
      expect(compareRelease(_release('4.9.0'), '4.10.0').state, UpdateState.current);
    });

    test('no published build is its own answer, not an error', () {
      expect(compareRelease(_release(null, available: false), '4.9.0').state,
          UpdateState.unpublished);
      expect(compareRelease(_release(''), '4.9.0').state, UpdateState.unpublished);
      // available:false with a version present is still nothing to download.
      expect(compareRelease(_release('4.10.0', available: false), '4.9.0').state,
          UpdateState.unpublished);
    });
  });

  group('formatBytes', () {
    // Mebibytes to one decimal, matching AndroidAppCard.vue on the website: a
    // user told to go there and verify the digest must not find a different
    // size for the same file.
    test('matches the website for the same byte count', () {
      expect(formatBytes(94013880), '89.7 MB');
      expect(formatBytes(62914560), '60.0 MB');
    });

    test('says so when there is no size', () {
      expect(formatBytes(null), '?');
      expect(formatBytes(0), '?');
      expect(formatBytes(-1), '?');
    });
  });

  group('isVersionedBuild', () {
    // Weak by construction: appVersion is a compile-time const and `flutter
    // test` passes no --dart-define, so this can only ever observe the
    // unstamped case. The behaviour that matters is pinned on compareRelease
    // above, which takes the version as a parameter and so IS testable both
    // ways.
    test('an unstamped build is not a release build', () {
      expect(isVersionedBuild, isFalse);
    });
  });
}
