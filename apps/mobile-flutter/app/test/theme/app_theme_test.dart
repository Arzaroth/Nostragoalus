import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/theme/app_theme.dart';

void main() {
  group('AppTheme', () {
    test('dark is the default; light and system opt out', () {
      expect(AppTheme.themeModeFor(null), ThemeMode.dark);
      expect(AppTheme.themeModeFor('dark'), ThemeMode.dark);
      expect(AppTheme.themeModeFor('anything'), ThemeMode.dark);
      expect(AppTheme.themeModeFor('light'), ThemeMode.light);
      expect(AppTheme.themeModeFor('system'), ThemeMode.system);
    });

    test('skins map to their web primary, unknown falls back to the brand', () {
      expect(AppTheme.skinSeed('twilight'), const Color(0xFF7C3AED));
      expect(AppTheme.skinSeed('pinkie'), const Color(0xFFDB2777));
      expect(AppTheme.skinSeed(null), AppTheme.brand);
      expect(AppTheme.skinSeed('nope'), AppTheme.brand);
    });

    test('both themes carry the tokens and the vendored faces', () {
      for (final theme in [AppTheme.light(), AppTheme.dark()]) {
        final t = theme.extension<AppTokens>();
        expect(t, isNotNull);
        expect(theme.textTheme.bodyMedium?.fontFamily, AppTheme.fontFamily);
        expect(theme.textTheme.headlineSmall?.fontFamily, AppTheme.displayFamily);
        expect(theme.scaffoldBackgroundColor, Colors.transparent);
        expect(theme.colorScheme.onPrimary, Colors.white);
      }
      expect(AppTheme.dark().colorScheme.surface, AppTheme.stand);
      expect(AppTheme.light().colorScheme.surface, Colors.white);
    });

    test('a skin seed lifts the dark primary without going pastel', () {
      final primary = AppTheme.dark(AppTheme.skinSeed('rainbow')).colorScheme.primary;
      expect(primary, Color.lerp(const Color(0xFF0284C7), Colors.white, 0.14));
    });

    test('the switch track outline is only drawn when off', () {
      final track = AppTheme.dark().switchTheme.trackOutlineColor!;
      expect(track.resolve({WidgetState.selected}), Colors.transparent);
      expect(track.resolve({}), AppTheme.darkTokens().ruleStrong);
    });
  });

  group('AppTokens', () {
    test('score is the condensed tabular face at the asked size', () {
      final style = AppTheme.darkTokens().score(34, color: Colors.red);
      expect(style.fontFamily, AppTheme.displayFamily);
      expect(style.fontSize, 34);
      expect(style.fontWeight, FontWeight.w700);
      expect(style.color, Colors.red);
      expect(style.fontFeatures, contains(const FontFeature.tabularFigures()));
    });

    test('copyWith overrides only what is given', () {
      final base = AppTheme.darkTokens();
      final copy = base.copyWith(live: Colors.pink, board: Colors.black);
      expect(copy.live, Colors.pink);
      expect(copy.board, Colors.black);
      expect(copy.rule, base.rule);
      expect(copy.emerald, base.emerald);
      expect(copy.gold, base.gold);
      expect(copy.glowB, base.glowB);
    });

    test('lerp blends every token and returns itself against null', () {
      final dark = AppTheme.darkTokens();
      final light = AppTheme.lightTokens();
      expect(dark.lerp(null, 0.5), same(dark));
      final mid = dark.lerp(light, 0.5);
      expect(mid.board, Color.lerp(dark.board, light.board, 0.5));
      expect(mid.muted, Color.lerp(dark.muted, light.muted, 0.5));
      expect(mid.live, Color.lerp(dark.live, light.live, 0.5));
      expect(mid.bronze, Color.lerp(dark.bronze, light.bronze, 0.5));
      expect(mid.glowA, Color.lerp(dark.glowA, light.glowA, 0.5));
      expect(dark.lerp(light, 0).ground, dark.ground);
      expect(dark.lerp(light, 1).ground, light.ground);
    });

    testWidgets('context.tokens reads the extension, or falls back per brightness',
        (tester) async {
      late AppTokens themed;
      late AppTokens bareLight;
      late AppTokens bareDark;
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light(),
        home: Builder(builder: (context) {
          themed = context.tokens;
          return const SizedBox();
        }),
      ));
      expect(themed.board, Colors.white);

      await tester.pumpWidget(MaterialApp(
        theme: ThemeData(brightness: Brightness.light),
        home: Builder(builder: (context) {
          bareLight = context.tokens;
          return const SizedBox();
        }),
      ));
      await tester.pumpAndSettle();
      expect(bareLight.ground, AppTheme.paper);

      await tester.pumpWidget(MaterialApp(
        theme: ThemeData(brightness: Brightness.dark),
        home: Builder(builder: (context) {
          bareDark = context.tokens;
          return const SizedBox();
        }),
      ));
      // MaterialApp animates between themes, so the first frame still lerps.
      await tester.pumpAndSettle();
      expect(bareDark.ground, AppTheme.night);
    });
  });
}
