import 'package:flutter/material.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';

void main() {
  final binding = WidgetsFlutterBinding.ensureInitialized();
  // Hold the native splash through the first frame so the brand screen bridges
  // the cold-start gap instead of a white flash; app.dart removes it once the
  // first frame is up.
  FlutterNativeSplash.preserve(widgetsBinding: binding);
  runApp(const ProviderScope(child: NostragoalusApp()));
}
