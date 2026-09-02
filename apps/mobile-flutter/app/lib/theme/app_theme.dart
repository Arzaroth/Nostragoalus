import 'package:flutter/material.dart';

/// Matches the web app's NostraTheme: a vibrant indigo primary with an emerald +
/// amber accent, over cool indigo-tinted surfaces (dark by default on the site).
class AppTheme {
  static const brand = Color(0xFF4F46E5); // indigo-600 (primary.color)
  static const emerald = Color(0xFF10B981);
  static const amber = Color(0xFFF59E0B); // the "star" accent
  static const danger = Color(0xFFEF4444);

  /// The primary color for the active konami skin (null = the default indigo),
  /// matching the `--p-primary-600` of each [data-skin] in skins.css.
  static Color skinSeed(String? skin) => switch (skin) {
        'twilight' => const Color(0xFF7C3AED),
        'rainbow' => const Color(0xFF0284C7),
        'pinkie' => const Color(0xFFDB2777),
        'applejack' => const Color(0xFFEA580C),
        'rarity' => const Color(0xFF9333EA),
        'fluttershy' => const Color(0xFFD97706),
        _ => brand,
      };

  // Dark-first, matching the web: only an explicit 'light' opts out, and
  // 'system' still defers to the platform. A null or unknown preference lands
  // on dark rather than the platform default.
  static ThemeMode themeModeFor(String? theme) => switch (theme) {
        'light' => ThemeMode.light,
        'system' => ThemeMode.system,
        _ => ThemeMode.dark,
      };

  // Surface ramp from lib/theme.ts (indigo-tinted neutrals).
  static const _darkBase = Color(0xFF0D0F1A); // surface-950
  static const _darkCard = Color(0xFF181B2B); // surface-900
  static const _darkElev = Color(0xFF262A3F); // surface-800
  static const _lightBase = Color(0xFFE7E8F6); // --ng-base

  /// The scaffold gradient painted behind the whole app (scaffolds are
  /// transparent so it shows through), echoing the web's tinted background: a
  /// faint indigo-to-emerald wash over the base.
  static const darkScaffoldGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF141827), _darkBase, Color(0xFF0C1512)],
    stops: [0.0, 0.55, 1.0],
  );

  static const lightScaffoldGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFEDEEFA), _lightBase, Color(0xFFE7F0EC)],
    stops: [0.0, 0.55, 1.0],
  );

  static ThemeData light([Color seed = brand]) {
    final scheme = ColorScheme.fromSeed(
      seedColor: seed,
      brightness: Brightness.light,
    ).copyWith(secondary: emerald, tertiary: amber, error: danger);
    return _base(scheme);
  }

  static ThemeData dark([Color seed = brand]) {
    final scheme = ColorScheme.fromSeed(
      seedColor: seed,
      brightness: Brightness.dark,
    ).copyWith(
      secondary: emerald,
      tertiary: amber,
      error: danger,
      surface: _darkCard,
      surfaceContainerLowest: _darkBase,
      surfaceContainerLow: _darkCard,
      surfaceContainer: _darkCard,
      surfaceContainerHigh: _darkElev,
      surfaceContainerHighest: _darkElev,
    );
    return _base(scheme);
  }

  static ThemeData _base(ColorScheme scheme) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      // Transparent so the root gradient (painted in app.dart) shows through
      // every scaffold and app bar, the way the web's tinted background does.
      scaffoldBackgroundColor: Colors.transparent,
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surface,
        indicatorColor: scheme.primary.withValues(alpha: 0.18),
      ),
      cardTheme: CardThemeData(
        color: scheme.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
    );
  }
}
