import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The two guards every release build (APK and iOS) runs before it bakes
/// anything in, exercised as the tasks call them.
void main() {
  group('check_release_bases.sh', () {
    Future<int> check(String api, [String web = 'https://goal.arzaroth.com']) async =>
        (await Process.run('bash', ['tool/check_release_bases.sh', 'test', api, web])).exitCode;

    test('accepts a public https origin', () async {
      expect(await check('https://goal.arzaroth.com'), 0);
      expect(await check('https://goal.arzaroth.com:8443/'), 0);
      // 172.32/12 is outside the private block, so it is routable.
      expect(await check('https://172.32.0.1'), 0);
    });

    test('refuses anything that is not https', () async {
      expect(await check('http://goal.arzaroth.com'), 1);
      expect(await check('goal.arzaroth.com'), 1);
    });

    test('refuses hosts a phone cannot reach', () async {
      for (final host in [
        'localhost', 'app.localhost', 'mac.local', '127.0.0.1', '10.0.2.2', '0.0.0.0',
        '169.254.1.1', '192.168.1.10', '172.16.0.1', '172.31.255.1', 'host.docker.internal',
      ]) {
        expect(await check('https://$host'), 1, reason: host);
      }
    });

    test('checks WEB_BASE as well as API_BASE', () async {
      expect(await check('https://goal.arzaroth.com', 'http://goal.arzaroth.com'), 1);
      expect(await check('https://goal.arzaroth.com', 'https://192.168.1.10'), 1);
    });
  });

  group('pubspec_version.sh', () {
    late Directory dir;
    setUp(() => dir = Directory.systemTemp.createTempSync('pubspec_version'));
    tearDown(() => dir.deleteSync(recursive: true));

    Future<ProcessResult> read(String versionLine) {
      final pubspec = File('${dir.path}/pubspec.yaml')..writeAsStringSync('name: x\n$versionLine\n');
      return Process.run('bash', ['tool/pubspec_version.sh', 'test', pubspec.path]);
    }

    test('prints the name and the build number', () async {
      final r = await read('version: 1.0.2+41003');
      expect(r.exitCode, 0);
      expect((r.stdout as String).trim(), '1.0.2 41003');
    });

    test('reads the real pubspec', () async {
      final r = await Process.run('bash', ['tool/pubspec_version.sh', 'test', 'pubspec.yaml']);
      expect(r.exitCode, 0);
      expect((r.stdout as String).trim(), matches(RegExp(r'^\d+\.\d+\.\d+ \d+$')));
    });

    test('refuses a version it cannot parse', () async {
      for (final line in ['version: 1.0.2', 'version: 1..2+3', 'version: 1.0.+3', 'version: 1.0.2+x', 'nothing']) {
        expect((await read(line)).exitCode, 1, reason: line);
      }
    });
  });
}
