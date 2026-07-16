import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:nostragoalus/spike/auth_probe.dart';

/// Phase 0 spike #1 on real hardware: bearer auth end to end against a live
/// server. Creds + API base come from `--dart-define` so no secrets live in git:
/// ```
/// flutter test integration_test/auth_probe_test.dart -d DEVICE \
///   --dart-define=API_BASE=http://127.0.0.1:3001 \
///   --dart-define=PROBE_EMAIL=probe@example.com \
///   --dart-define=PROBE_PASSWORD='Probe-Password123!'
/// ```
/// `adb reverse tcp:3001 tcp:3001` tunnels the device's localhost to the host.
///
/// NOTE: over wireless adb the Dart Development Service handshake is flaky; the
/// reliable on-device path is the headless logcat entrypoint in
/// `lib/spike/auth_probe_main.dart`.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const email = String.fromEnvironment('PROBE_EMAIL');
  const password = String.fromEnvironment('PROBE_PASSWORD');

  testWidgets('bearer sign-in + authed call succeeds on device', (tester) async {
    expect(email, isNotEmpty, reason: 'pass --dart-define=PROBE_EMAIL');
    expect(password, isNotEmpty, reason: 'pass --dart-define=PROBE_PASSWORD');

    final out = await AuthProbe().run(email, password);
    // ignore: avoid_print
    print('AUTH_PROBE_OUTPUT>>>\n$out\n<<<');
    expect(out, contains('PASS - bearer auth works end to end'), reason: out);
  });
}
