import 'package:flutter/material.dart';

/// A national flag by FIFA tricode (e.g. FRA, ESP), from the bundled
/// `assets/flags/<CODE>.png` set - the same square FIFA images the web uses via
/// `flagUrl`, vendored so the app works offline. Falls back to a tinted chip
/// with the code when a flag is missing (a new tricode, or no code at all), so
/// a match never renders a broken image.
class TeamFlag extends StatelessWidget {
  const TeamFlag(this.code, {super.key, this.height = 20});

  final String? code;
  final double height;

  @override
  Widget build(BuildContext context) {
    final width = height * 3 / 2;
    final radius = BorderRadius.circular(height * 0.18);
    final scheme = Theme.of(context).colorScheme;
    final border = Border.all(color: scheme.outlineVariant.withValues(alpha: 0.5), width: 0.5);

    Widget fallback() => Container(
          width: width,
          height: height,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest,
            borderRadius: radius,
            border: border,
          ),
          child: Text(
            (code ?? '').isEmpty ? '?' : code!,
            style: TextStyle(
                fontSize: height * 0.42,
                fontWeight: FontWeight.w700,
                color: scheme.onSurfaceVariant),
          ),
        );

    if (code == null || code!.isEmpty) return fallback();

    return ClipRRect(
      borderRadius: radius,
      child: Container(
        decoration: BoxDecoration(borderRadius: radius, border: border),
        child: Image.asset(
          'assets/flags/${code!.toUpperCase()}.png',
          width: width,
          height: height,
          fit: BoxFit.cover,
          filterQuality: FilterQuality.medium,
          errorBuilder: (_, __, ___) => fallback(),
        ),
      ),
    );
  }
}
