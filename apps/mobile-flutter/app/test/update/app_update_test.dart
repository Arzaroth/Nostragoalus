import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/update/app_update.dart';

AppRelease _release(String? version, {bool available = true, int? size}) =>
    AppRelease.fromJson({
      'available': available,
      'version': version,
      'sizeBytes': size,
      'sha256': version == null ? null : 'deadbeef',
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
    test('a newer published build carries its size and digest', () {
      final r = compareRelease(_release('4.10.0', size: 94000000), '4.9.0');
      expect(r.state, UpdateState.newer);
      expect(r.version, '4.10.0');
      expect(r.sizeBytes, 94000000);
      expect(r.sha256, 'deadbeef');
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
    test('rounds to megabytes', () {
      expect(formatBytes(94013880), '94 MB');
      expect(formatBytes(1500000), '2 MB');
    });

    test('says so when there is no size', () {
      expect(formatBytes(null), '?');
      expect(formatBytes(0), '?');
      expect(formatBytes(-1), '?');
    });
  });

  group('isVersionedBuild', () {
    // The test binary carries no --dart-define, so it is the unversioned case:
    // there is no release version to compare and the card says so rather than
    // guessing "up to date".
    test('an unstamped build is not a release build', () {
      expect(isVersionedBuild, isFalse);
    });
  });
}
