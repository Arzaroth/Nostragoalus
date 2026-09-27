import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// `apk-publish` is the only thing that stamps a release version into the
/// binary, and a missing define fails SILENTLY: the app falls back to `dev`,
/// the server cannot place it, and the client-version floor is inert forever -
/// discovered only when a floor raise mysteriously locks out nobody.
///
/// The same task already carries loud guards for `API_BASE`/`WEB_BASE`, written
/// after a build shipped pointing at an unroutable host (v4.7.0). This is the
/// same class of mistake, one line up.
void main() {
  test('the release build stamps APP_VERSION from the release version', () {
    final publish = _task('apk-publish');

    expect(publish, contains(r'--dart-define=APP_VERSION="$version"'),
        reason: 'without this every published APK reports itself as `dev` and '
            'the server can never place it');
    // The same $version the APK's own metadata uses, so the header, the
    // versionName and what the site advertises cannot disagree.
    expect(publish, contains(r'--build-name="$version"'));
    expect(publish, contains('tool/check_release_bases.sh apk-publish'));
    expect(publish, contains('tool/pubspec_version.sh apk-publish'));
  });

  test('the iOS release build stamps the same APP_VERSION', () {
    final ipa = _task('ipa');

    expect(ipa, contains(r'--dart-define=APP_VERSION="$version"'));
    expect(ipa, contains(r'--build-name="$version"'));
    expect(ipa, contains(r'--build-number="$code"'));
    expect(ipa, contains('tool/check_release_bases.sh ipa'));
    expect(ipa, contains('tool/pubspec_version.sh ipa'));
  });
}

/// One task's block of `.mise.toml`, up to the next task, so an assertion about
/// one task cannot be satisfied by the same line in another.
String _task(String name) {
  final mise = File('../.mise.toml').readAsStringSync();
  final start = mise.indexOf('[tasks.$name]');
  expect(start, isNot(-1), reason: 'no [tasks.$name] in .mise.toml');
  final next = mise.indexOf('\n[tasks.', start + 1);
  return mise.substring(start, next == -1 ? mise.length : next);
}
