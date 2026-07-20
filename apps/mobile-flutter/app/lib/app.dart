import 'package:flutter/material.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'deeplink/deep_links.dart';
import 'i18n/i18n_scope.dart';
import 'state/providers.dart';
import 'theme/app_theme.dart';
import 'ui/home_shell.dart';
import 'ui/sign_in_screen.dart';

/// Root widget. Loads the active locale, then gates the tree on the session:
/// signed out -> sign in, signed in -> the tabbed home shell.
class NostragoalusApp extends ConsumerWidget {
  const NostragoalusApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Persist locale / competition changes for the next cold start.
    ref.watch(prefsPersistenceProvider);
    // No account's cached reads may outlive its session.
    ref.watch(accountCacheGuardProvider);
    // Honor the signed-in user's konami skin + light/dark preference.
    final user = ref.watch(authControllerProvider).valueOrNull;
    final seed = AppTheme.skinSeed(user?.skin);
    final mode = AppTheme.themeModeFor(user?.theme);
    return ref.watch(i18nProvider).when(
          // A locale change RELOADS this provider. Without this the whole
          // MaterialApp is replaced by the bootstrap screen mid-session, tearing
          // down every pushed route and the deep-link controller; the previous
          // locale's strings render until the new ones resolve instead.
          skipLoadingOnReload: true,
          loading: () => const _Bootstrapping(),
          error: (e, _) => _Bootstrapping(error: '$e'),
          data: (i18n) => I18nScope(
            i18n: i18n,
            child: MaterialApp(
              title: 'Nostragoalus',
              debugShowCheckedModeBanner: false,
              navigatorKey: navigatorKey,
              theme: AppTheme.light(seed),
              darkTheme: AppTheme.dark(seed),
              themeMode: mode,
              builder: (context, child) => Directionality(
                textDirection: i18n.textDirection,
                child: DeepLinkController(child: child!),
              ),
              home: const _AuthGate(),
            ),
          ),
        );
  }
}

class _AuthGate extends ConsumerStatefulWidget {
  const _AuthGate();

  @override
  ConsumerState<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends ConsumerState<_AuthGate> {
  bool _splashRemoved = false;

  /// Drop the native splash once, after the first real screen has laid out.
  void _removeSplashOnce() {
    if (_splashRemoved) return;
    _splashRemoved = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => FlutterNativeSplash.remove());
  }

  @override
  Widget build(BuildContext context) {
    return ref.watch(authControllerProvider).when(
          loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
          // An auth error means no usable session; fall back to sign in.
          error: (_, __) {
            _removeSplashOnce();
            return const SignInScreen();
          },
          data: (user) {
            _removeSplashOnce();
            return user == null ? const SignInScreen() : const HomeShell();
          },
        );
  }
}

class _Bootstrapping extends StatelessWidget {
  const _Bootstrapping({this.error});
  final String? error;

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: ThemeMode.system,
        home: Scaffold(
          body: Center(
            child: error == null
                ? const CircularProgressIndicator()
                : Padding(padding: const EdgeInsets.all(24), child: Text(error!)),
          ),
        ),
      );
}
