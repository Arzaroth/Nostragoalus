import 'package:flutter/widgets.dart';

import 'auth_probe.dart';

/// Headless on-device probe entrypoint. Avoids the integration_test / Dart
/// Development Service path (flaky over wireless adb) - runs the probe at launch
/// and writes the result to logcat, so the host reads it with `adb logcat`:
///   flutter build apk --debug --target lib/spike/auth_probe_main.dart \
///     --dart-define=API_BASE=http://127.0.0.1:3001 \
///     --dart-define=PROBE_EMAIL=... --dart-define=PROBE_PASSWORD=...
///   adb install -r ...; adb reverse tcp:3001 tcp:3001
///   adb logcat -c; adb shell am start -n com.arzaroth.nostragoalus/.MainActivity
///   adb logcat -d | grep AUTH_PROBE
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const email = String.fromEnvironment('PROBE_EMAIL');
  const password = String.fromEnvironment('PROBE_PASSWORD');
  var result = 'FAIL';
  try {
    final out = await AuthProbe().run(email, password);
    for (final line in out.split('\n')) {
      debugPrint('AUTH_PROBE| $line');
    }
    result = out.contains('PASS - bearer auth works end to end') ? 'PASS' : 'FAIL';
  } catch (e) {
    debugPrint('AUTH_PROBE| exception: $e');
  }
  debugPrint('AUTH_PROBE| RESULT=$result');
  runApp(const _Done());
}

class _Done extends StatelessWidget {
  const _Done();
  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
