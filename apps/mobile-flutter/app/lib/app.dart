import 'package:flutter/material.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'deeplink/deep_links.dart';
import 'i18n/i18n_scope.dart';
import 'state/providers.dart';
import 'theme/app_theme.dart';
import 'ui/home_shell.dart';
import 'ui/sign_in_screen.dart';
import 'ui/update_required_screen.dart';

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
                child: _GradientBackground(
                  child: DeepLinkController(child: child!),
                ),
              ),
              home: const _VersionGate(),
            ),
          ),
        );
  }
}

/// Swaps the whole app for the update screen once any route has answered 426.
/// Above [_AuthGate] on purpose: a build the server refuses cannot sign in
/// either, so presenting a login form first would be a dead end.
class _VersionGate extends ConsumerWidget {
  const _VersionGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) => ref.watch(clientOutdatedProvider)
      ? const UpdateRequiredScreen()
      : const _AuthGate();
}

/// Paints the floodlit ground behind the whole app: the night (or paper) base
/// with two soft glows, primary from the top corner and emerald from the far
/// side, the way the web's body background is lit. Scaffolds are transparent
/// (see AppTheme) so it shows through every screen.
class _GradientBackground extends StatelessWidget {
  const _GradientBackground({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return CustomPaint(
      painter: _FloodlightPainter(ground: t.ground, glowA: t.glowA, glowB: t.glowB),
      child: child,
    );
  }
}

class _FloodlightPainter extends CustomPainter {
  const _FloodlightPainter({required this.ground, required this.glowA, required this.glowB});
  final Color ground;
  final Color glowA;
  final Color glowB;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(rect, Paint()..color = ground);
    void glow(Alignment at, double radius, Color color) {
      final center = at.alongSize(size);
      canvas.drawRect(
        rect,
        Paint()
          ..shader = RadialGradient(radius: 1.0, colors: [color, color.withValues(alpha: 0)])
              .createShader(Rect.fromCircle(center: center, radius: radius)),
      );
    }

    glow(const Alignment(-0.9, -1.1), size.width * 1.1, glowA);
    glow(const Alignment(1.1, -0.2), size.width * 0.8, glowB);
  }

  @override
  bool shouldRepaint(_FloodlightPainter old) =>
      old.ground != ground || old.glowA != glowA || old.glowB != glowB;
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
