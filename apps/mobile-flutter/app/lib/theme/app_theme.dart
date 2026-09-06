import 'package:flutter/material.dart';

/// "Floodlit": a night match. The ground is the dark stadium, chalk hairlines
/// are the structure, and the scoreboard numerals (Barlow Condensed) are the one
/// loud element. The web brand survives as roles: indigo is the interactive
/// colour, emerald the pitch (exact / correct), amber the floodlight (star /
/// joker), red is live.
class AppTheme {
  static const brand = Color(0xFF4F46E5); // indigo-600, the web's primary
  static const emerald = Color(0xFF34D399);
  static const amber = Color(0xFFF5B32B);
  static const live = Color(0xFFF0524F);

  static const fontFamily = 'Barlow';
  static const displayFamily = 'BarlowCondensed';

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

  // Dark ramp: night ground, stand (boards), turf (raised), chalk (text).
  static const night = Color(0xFF070A12);
  static const stand = Color(0xFF10141F);
  static const turf = Color(0xFF182032);
  static const chalk = Color(0xFFEEF1F7);
  static const _chalkMuted = Color(0xFF9AA3B8);
  static const _chalkFaint = Color(0xFF515A70);

  // Light ramp: paper ground, white boards, ink text.
  static const paper = Color(0xFFF2F3F8);
  static const _board = Color(0xFFFFFFFF);
  static const _raised = Color(0xFFEAECF4);
  static const ink = Color(0xFF141827);
  static const _inkMuted = Color(0xFF5B6178);
  static const _inkFaint = Color(0xFFA3A8BA);

  static ThemeData light([Color seed = brand]) {
    final primary = seed;
    final scheme = ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.light).copyWith(
      primary: primary,
      onPrimary: Colors.white,
      primaryContainer: Color.alphaBlend(primary.withValues(alpha: 0.12), _board),
      onPrimaryContainer: Color.lerp(primary, ink, 0.3),
      secondary: const Color(0xFF0E9F6E),
      onSecondary: Colors.white,
      secondaryContainer: Color.alphaBlend(emerald.withValues(alpha: 0.16), _board),
      onSecondaryContainer: const Color(0xFF0A6E4D),
      tertiary: const Color(0xFFC77F00),
      onTertiary: Colors.white,
      tertiaryContainer: Color.alphaBlend(amber.withValues(alpha: 0.18), _board),
      onTertiaryContainer: const Color(0xFF7A4E00),
      error: const Color(0xFFD9342F),
      onError: Colors.white,
      errorContainer: Color.alphaBlend(live.withValues(alpha: 0.14), _board),
      onErrorContainer: const Color(0xFF9B1F1B),
      surface: _board,
      onSurface: ink,
      onSurfaceVariant: _inkMuted,
      surfaceContainerLowest: paper,
      surfaceContainerLow: _board,
      surfaceContainer: _board,
      surfaceContainerHigh: _raised,
      surfaceContainerHighest: _raised,
      outline: _inkFaint,
      outlineVariant: ink.withValues(alpha: 0.10),
      shadow: const Color(0xFF1E1B4B),
    );
    return _base(scheme, lightTokens(primary));
  }

  static AppTokens lightTokens([Color primary = brand]) => AppTokens(
        rule: ink.withValues(alpha: 0.10),
        ruleStrong: ink.withValues(alpha: 0.18),
        muted: _inkMuted,
        faint: _inkFaint,
        board: _board,
        raised: _raised,
        ground: paper,
        emerald: const Color(0xFF0E9F6E),
        amber: const Color(0xFFC77F00),
        live: const Color(0xFFD9342F),
        gold: const Color(0xFFB98A00),
        silver: const Color(0xFF7C8496),
        bronze: const Color(0xFFA86A33),
        glowA: primary.withValues(alpha: 0.16),
        glowB: emerald.withValues(alpha: 0.10),
      );

  static ThemeData dark([Color seed = brand]) {
    // fromSeed's dark primary is a pastel tone 80; the brand should stay
    // saturated on the night ground, only lifted enough to read.
    final primary = Color.lerp(seed, Colors.white, 0.14)!;
    final scheme = ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.dark).copyWith(
      primary: primary,
      onPrimary: Colors.white,
      primaryContainer: Color.alphaBlend(primary.withValues(alpha: 0.22), stand),
      onPrimaryContainer: Color.lerp(primary, Colors.white, 0.55),
      secondary: emerald,
      onSecondary: night,
      secondaryContainer: Color.alphaBlend(emerald.withValues(alpha: 0.16), stand),
      onSecondaryContainer: Color.lerp(emerald, Colors.white, 0.35),
      tertiary: amber,
      onTertiary: night,
      tertiaryContainer: Color.alphaBlend(amber.withValues(alpha: 0.16), stand),
      onTertiaryContainer: Color.lerp(amber, Colors.white, 0.35),
      error: live,
      onError: Colors.white,
      errorContainer: Color.alphaBlend(live.withValues(alpha: 0.18), stand),
      onErrorContainer: Color.lerp(live, Colors.white, 0.4),
      surface: stand,
      onSurface: chalk,
      onSurfaceVariant: _chalkMuted,
      surfaceContainerLowest: night,
      surfaceContainerLow: stand,
      surfaceContainer: stand,
      surfaceContainerHigh: turf,
      surfaceContainerHighest: turf,
      outline: _chalkFaint,
      outlineVariant: chalk.withValues(alpha: 0.10),
      inverseSurface: chalk,
      onInverseSurface: night,
      inversePrimary: seed,
    );
    return _base(scheme, darkTokens(primary));
  }

  static AppTokens darkTokens([Color primary = brand]) => AppTokens(
        rule: chalk.withValues(alpha: 0.10),
        ruleStrong: chalk.withValues(alpha: 0.20),
        muted: _chalkMuted,
        faint: _chalkFaint,
        board: stand,
        raised: turf,
        ground: night,
        emerald: emerald,
        amber: amber,
        live: live,
        gold: const Color(0xFFF2C14E),
        silver: const Color(0xFFC3CAD9),
        bronze: const Color(0xFFD08A4E),
        glowA: primary.withValues(alpha: 0.26),
        glowB: emerald.withValues(alpha: 0.12),
      );

  /// The read faces: Barlow for everything read, Barlow Condensed for what is
  /// glanced at (scores, points, ranks, screen titles). Tabular figures on the
  /// condensed roles so columns of numbers stay aligned.
  static TextTheme textTheme(ColorScheme scheme, AppTokens t) {
    const tabular = [FontFeature.tabularFigures()];
    TextStyle display(double size, FontWeight w, {double height = 1.0}) => TextStyle(
          fontFamily: displayFamily,
          fontSize: size,
          fontWeight: w,
          height: height,
          color: scheme.onSurface,
          fontFeatures: tabular,
          letterSpacing: 0,
        );
    TextStyle body(double size, FontWeight w, {double height = 1.4, Color? color}) => TextStyle(
          fontFamily: fontFamily,
          fontSize: size,
          fontWeight: w,
          height: height,
          color: color ?? scheme.onSurface,
          letterSpacing: 0,
        );
    return TextTheme(
      displayLarge: display(56, FontWeight.w700),
      displayMedium: display(44, FontWeight.w700),
      displaySmall: display(36, FontWeight.w600, height: 1.05),
      headlineLarge: display(30, FontWeight.w600, height: 1.1),
      headlineMedium: display(26, FontWeight.w600, height: 1.1),
      headlineSmall: display(22, FontWeight.w600, height: 1.15),
      titleLarge: body(20, FontWeight.w600, height: 1.2),
      titleMedium: body(17, FontWeight.w600, height: 1.25),
      titleSmall: body(15, FontWeight.w600, height: 1.3),
      bodyLarge: body(16, FontWeight.w400),
      bodyMedium: body(15, FontWeight.w400),
      bodySmall: body(13, FontWeight.w400, height: 1.35, color: t.muted),
      labelLarge: body(15, FontWeight.w600, height: 1.2),
      labelMedium: body(13, FontWeight.w500, height: 1.2),
      labelSmall: body(12, FontWeight.w500, height: 1.2, color: t.muted),
    );
  }

  static ThemeData _base(ColorScheme scheme, AppTokens t) {
    final text = textTheme(scheme, t);
    final radius12 = BorderRadius.circular(12);
    final radius16 = BorderRadius.circular(16);
    final inputBorder = OutlineInputBorder(
      borderRadius: radius12,
      borderSide: BorderSide(color: t.ruleStrong),
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      fontFamily: fontFamily,
      textTheme: text,
      extensions: [t],
      // Transparent so the floodlight ground (painted in app.dart) shows through
      // every scaffold and app bar, the way the web's tinted background does.
      scaffoldBackgroundColor: Colors.transparent,
      canvasColor: t.board,
      dividerColor: t.rule,
      splashColor: scheme.primary.withValues(alpha: 0.10),
      highlightColor: Colors.transparent,
      splashFactory: InkSparkle.splashFactory,
      visualDensity: VisualDensity.standard,
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      }),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleSpacing: 20,
        toolbarHeight: 60,
        titleTextStyle: text.headlineMedium?.copyWith(fontSize: 28),
        iconTheme: IconThemeData(color: scheme.onSurface, size: 22),
        actionsIconTheme: IconThemeData(color: t.muted, size: 22),
      ),
      iconTheme: IconThemeData(color: scheme.onSurface, size: 22),
      cardTheme: CardThemeData(
        color: t.board,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: radius16, side: BorderSide(color: t.rule)),
      ),
      listTileTheme: ListTileThemeData(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
        minVerticalPadding: 10,
        iconColor: t.muted,
        titleTextStyle: text.bodyMedium?.copyWith(fontWeight: FontWeight.w500),
        subtitleTextStyle: text.bodySmall,
        leadingAndTrailingTextStyle: text.labelMedium?.copyWith(color: t.muted),
      ),
      expansionTileTheme: ExpansionTileThemeData(
        shape: const Border(),
        collapsedShape: const Border(),
        tilePadding: const EdgeInsets.symmetric(horizontal: 20),
        childrenPadding: EdgeInsets.zero,
        iconColor: t.muted,
        collapsedIconColor: t.faint,
        textColor: scheme.onSurface,
        collapsedTextColor: scheme.onSurface,
      ),
      dividerTheme: DividerThemeData(color: t.rule, thickness: 1, space: 1),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          shape: RoundedRectangleBorder(borderRadius: radius12),
          textStyle: text.labelLarge,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          foregroundColor: scheme.onSurface,
          side: BorderSide(color: t.ruleStrong),
          shape: RoundedRectangleBorder(borderRadius: radius12),
          textStyle: text.labelLarge,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(44, 44),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          shape: RoundedRectangleBorder(borderRadius: radius12),
          textStyle: text.labelLarge,
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: radius12),
        ),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(
          side: BorderSide(color: t.ruleStrong),
          selectedBackgroundColor: scheme.primaryContainer,
          selectedForegroundColor: scheme.onPrimaryContainer,
          textStyle: text.labelMedium,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: t.raised,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: inputBorder,
        enabledBorder: inputBorder,
        disabledBorder: inputBorder.copyWith(borderSide: BorderSide(color: t.rule)),
        focusedBorder: inputBorder.copyWith(borderSide: BorderSide(color: scheme.primary, width: 1.5)),
        errorBorder: inputBorder.copyWith(borderSide: BorderSide(color: scheme.error)),
        focusedErrorBorder:
            inputBorder.copyWith(borderSide: BorderSide(color: scheme.error, width: 1.5)),
        labelStyle: text.bodyMedium?.copyWith(color: t.muted),
        floatingLabelStyle: text.labelMedium?.copyWith(color: scheme.primary),
        hintStyle: text.bodyMedium?.copyWith(color: t.faint),
        helperStyle: text.labelSmall,
        errorStyle: text.labelSmall?.copyWith(color: scheme.error),
        prefixIconColor: t.muted,
        suffixIconColor: t.muted,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: Colors.transparent,
        selectedColor: scheme.primaryContainer,
        disabledColor: Colors.transparent,
        side: BorderSide(color: t.ruleStrong),
        shape: const StadiumBorder(),
        labelStyle: text.labelMedium?.copyWith(color: scheme.onSurface),
        secondaryLabelStyle: text.labelMedium?.copyWith(color: scheme.onPrimaryContainer),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        labelPadding: EdgeInsets.zero,
        showCheckmark: false,
        iconTheme: IconThemeData(color: t.muted, size: 16),
      ),
      tabBarTheme: TabBarThemeData(
        labelStyle: text.labelLarge?.copyWith(fontSize: 14),
        unselectedLabelStyle: text.labelLarge?.copyWith(fontSize: 14, fontWeight: FontWeight.w500),
        labelColor: scheme.onSurface,
        unselectedLabelColor: t.muted,
        indicatorColor: scheme.primary,
        indicatorSize: TabBarIndicatorSize.label,
        dividerColor: t.rule,
        overlayColor: WidgetStatePropertyAll(scheme.primary.withValues(alpha: 0.06)),
        labelPadding: const EdgeInsets.symmetric(horizontal: 14),
        tabAlignment: TabAlignment.start,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: t.board,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: t.rule),
        ),
        titleTextStyle: text.headlineSmall,
        contentTextStyle: text.bodyMedium,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: t.board,
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: t.board,
        showDragHandle: true,
        dragHandleColor: t.ruleStrong,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: t.raised,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: radius12, side: BorderSide(color: t.rule)),
        textStyle: text.bodyMedium,
        labelTextStyle: WidgetStatePropertyAll(text.bodyMedium),
      ),
      menuTheme: MenuThemeData(
        style: MenuStyle(
          backgroundColor: WidgetStatePropertyAll(t.raised),
          surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: radius12, side: BorderSide(color: t.rule)),
          ),
        ),
      ),
      dropdownMenuTheme: DropdownMenuThemeData(textStyle: text.bodyMedium),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: scheme.inverseSurface,
        contentTextStyle: text.bodyMedium?.copyWith(color: scheme.onInverseSurface),
        actionTextColor: scheme.inversePrimary,
        shape: RoundedRectangleBorder(borderRadius: radius12),
        insetPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: t.raised,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: t.rule),
        ),
        textStyle: text.labelMedium?.copyWith(color: scheme.onSurface),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      ),
      switchTheme: SwitchThemeData(
        trackOutlineColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Colors.transparent : t.ruleStrong,
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: scheme.primary,
        linearTrackColor: t.rule,
        circularTrackColor: Colors.transparent,
      ),
      badgeTheme: BadgeThemeData(
        backgroundColor: t.live,
        textColor: Colors.white,
        textStyle: text.labelSmall?.copyWith(color: Colors.white, fontSize: 10),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: t.board,
        surfaceTintColor: Colors.transparent,
        indicatorColor: Colors.transparent,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: radius16),
      ),
      checkboxTheme: CheckboxThemeData(
        side: BorderSide(color: t.ruleStrong, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
      ),
      sliderTheme: SliderThemeData(inactiveTrackColor: t.ruleStrong),
      dataTableTheme: DataTableThemeData(
        dividerThickness: 1,
        headingTextStyle: text.labelSmall,
        dataTextStyle: text.bodyMedium,
      ),
    );
  }
}

/// The design tokens the colour scheme has no slot for: the chalk rules, the
/// board / raised surfaces, the semantic accents and the medal metals. Read
/// with `context.tokens`.
class AppTokens extends ThemeExtension<AppTokens> {
  const AppTokens({
    required this.rule,
    required this.ruleStrong,
    required this.muted,
    required this.faint,
    required this.board,
    required this.raised,
    required this.ground,
    required this.emerald,
    required this.amber,
    required this.live,
    required this.gold,
    required this.silver,
    required this.bronze,
    required this.glowA,
    required this.glowB,
  });

  /// Chalk hairline between rows and around boards.
  final Color rule;

  /// A firmer rule: input borders, chips, outlined buttons.
  final Color ruleStrong;

  /// Secondary text.
  final Color muted;

  /// Tertiary text: placeholders, disabled, decorative glyphs.
  final Color faint;

  /// The surface lists and forms sit on.
  final Color board;

  /// One step up from the board: inputs, pressed rows, menus.
  final Color raised;

  /// The page ground behind everything.
  final Color ground;
  final Color emerald;
  final Color amber;
  final Color live;
  final Color gold;
  final Color silver;
  final Color bronze;

  /// The two floodlight glows painted on the ground (primary, emerald).
  final Color glowA;
  final Color glowB;

  /// Scoreboard numerals: the condensed display face with tabular figures.
  TextStyle score(double size, {FontWeight weight = FontWeight.w700, Color? color}) => TextStyle(
        fontFamily: AppTheme.displayFamily,
        fontSize: size,
        fontWeight: weight,
        height: 1.0,
        color: color,
        fontFeatures: const [FontFeature.tabularFigures()],
        letterSpacing: 0,
      );

  @override
  AppTokens copyWith({
    Color? rule,
    Color? ruleStrong,
    Color? muted,
    Color? faint,
    Color? board,
    Color? raised,
    Color? ground,
    Color? emerald,
    Color? amber,
    Color? live,
    Color? gold,
    Color? silver,
    Color? bronze,
    Color? glowA,
    Color? glowB,
  }) =>
      AppTokens(
        rule: rule ?? this.rule,
        ruleStrong: ruleStrong ?? this.ruleStrong,
        muted: muted ?? this.muted,
        faint: faint ?? this.faint,
        board: board ?? this.board,
        raised: raised ?? this.raised,
        ground: ground ?? this.ground,
        emerald: emerald ?? this.emerald,
        amber: amber ?? this.amber,
        live: live ?? this.live,
        gold: gold ?? this.gold,
        silver: silver ?? this.silver,
        bronze: bronze ?? this.bronze,
        glowA: glowA ?? this.glowA,
        glowB: glowB ?? this.glowB,
      );

  @override
  AppTokens lerp(AppTokens? other, double t) {
    if (other == null) return this;
    Color c(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppTokens(
      rule: c(rule, other.rule),
      ruleStrong: c(ruleStrong, other.ruleStrong),
      muted: c(muted, other.muted),
      faint: c(faint, other.faint),
      board: c(board, other.board),
      raised: c(raised, other.raised),
      ground: c(ground, other.ground),
      emerald: c(emerald, other.emerald),
      amber: c(amber, other.amber),
      live: c(live, other.live),
      gold: c(gold, other.gold),
      silver: c(silver, other.silver),
      bronze: c(bronze, other.bronze),
      glowA: c(glowA, other.glowA),
      glowB: c(glowB, other.glowB),
    );
  }
}

extension AppTokensContext on BuildContext {
  /// The app's tokens, or the defaults for the ambient brightness when a tree
  /// was themed without them (widget tests on a bare MaterialApp).
  AppTokens get tokens {
    final theme = Theme.of(this);
    return theme.extension<AppTokens>() ??
        (theme.brightness == Brightness.dark ? AppTheme.darkTokens() : AppTheme.lightTokens());
  }
}
