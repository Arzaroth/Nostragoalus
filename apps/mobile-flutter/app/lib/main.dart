import 'package:flutter/material.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'state/app_prefs.dart';
import 'state/providers.dart';

Future<void> main() async {
  final binding = WidgetsFlutterBinding.ensureInitialized();
  // Hold the native splash through the first frame so the brand screen bridges
  // the cold-start gap instead of a white flash; app.dart removes it once the
  // first frame is up.
  FlutterNativeSplash.preserve(widgetsBinding: binding);
  // Read the stored locale/competition before the first build so the app opens
  // in the user's language instead of flashing English.
  final prefs = AppPrefs();
  await prefs.load();
  runApp(ProviderScope(
    overrides: [appPrefsProvider.overrideWithValue(prefs)],
    child: const NostragoalusApp(),
  ));
}
