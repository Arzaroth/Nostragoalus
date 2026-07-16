import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

/// The five shipped locales (tlh = Klingon). Arabic renders right-to-left.
const supportedLocales = <Locale>[
  Locale('en'),
  Locale('fr'),
  Locale('th'),
  Locale('tlh'),
  Locale('ar'),
];

/// Loads a locale's strings from the bundled `shared/i18n-json` mirror and looks
/// them up by dotted key (`achievements.cabinetTitle`), interpolating `{var}`
/// placeholders. Missing keys fall back to English, then to the key itself.
class I18n {
  I18n(this._map, this._fallback, this.locale);

  final Map<String, dynamic> _map;
  final Map<String, dynamic> _fallback;
  final Locale locale;

  bool get isRtl => locale.languageCode == 'ar';
  TextDirection get textDirection => isRtl ? TextDirection.rtl : TextDirection.ltr;

  String t(String key, [Map<String, Object?>? vars]) {
    final raw = _lookup(_map, key) ?? _lookup(_fallback, key) ?? key;
    return _interpolate(raw, vars);
  }

  static String? _lookup(Map<String, dynamic> m, String dotted) {
    Object? cur = m;
    for (final part in dotted.split('.')) {
      if (cur is Map && cur.containsKey(part)) {
        cur = cur[part];
      } else {
        return null;
      }
    }
    return cur is String ? cur : null;
  }

  static String _interpolate(String s, Map<String, Object?>? vars) {
    if (vars == null || vars.isEmpty) return s;
    return s.replaceAllMapped(
      RegExp(r'\{(\w+)\}'),
      (m) => vars[m.group(1)]?.toString() ?? m.group(0)!,
    );
  }

  static Future<I18n> load(Locale locale) async {
    final code = supportedLocales.any((l) => l.languageCode == locale.languageCode)
        ? locale.languageCode
        : 'en';
    final map = await _loadMap(code);
    final fallback = code == 'en' ? map : await _loadMap('en');
    return I18n(map, fallback, Locale(code));
  }

  static Future<Map<String, dynamic>> _loadMap(String code) async =>
      jsonDecode(await rootBundle.loadString('assets/i18n/$code.json')) as Map<String, dynamic>;
}
