import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'i18n/i18n_scope.dart';
import 'state/providers.dart';
import 'ui/home_shell.dart';
import 'ui/sign_in_screen.dart';

/// Root widget. Loads the active locale, then gates the tree on the session:
/// signed out -> sign in, signed in -> the tabbed home shell.
class NostragoalusApp extends ConsumerWidget {
  const NostragoalusApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = ThemeData(colorSchemeSeed: Colors.green, useMaterial3: true);
    return ref.watch(i18nProvider).when(
          loading: () => _Bootstrapping(theme: theme),
          error: (e, _) => _Bootstrapping(theme: theme, error: '$e'),
          data: (i18n) => I18nScope(
            i18n: i18n,
            child: MaterialApp(
              title: 'Nostragoalus',
              debugShowCheckedModeBanner: false,
              theme: theme,
              builder: (context, child) =>
                  Directionality(textDirection: i18n.textDirection, child: child!),
              home: const _AuthGate(),
            ),
          ),
        );
  }
}

class _AuthGate extends ConsumerWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(authControllerProvider).when(
          loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
          // An auth error means no usable session; fall back to sign in.
          error: (_, __) => const SignInScreen(),
          data: (user) => user == null ? const SignInScreen() : const HomeShell(),
        );
  }
}

class _Bootstrapping extends StatelessWidget {
  const _Bootstrapping({required this.theme, this.error});
  final ThemeData theme;
  final String? error;

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: theme,
        home: Scaffold(
          body: Center(
            child: error == null
                ? const CircularProgressIndicator()
                : Padding(padding: const EdgeInsets.all(24), child: Text(error!)),
          ),
        ),
      );
}
