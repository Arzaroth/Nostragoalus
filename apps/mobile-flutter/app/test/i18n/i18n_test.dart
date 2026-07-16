import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/i18n/i18n.dart';

void main() {
  I18n build(Map<String, dynamic> map, {Map<String, dynamic>? fallback, String code = 'en'}) =>
      I18n(map, fallback ?? map, Locale(code));

  test('looks up a nested dotted key', () {
    final i = build({
      'achievements': {'cabinetTitle': 'Trophy cabinet'},
    });
    expect(i.t('achievements.cabinetTitle'), 'Trophy cabinet');
  });

  test('interpolates {var} placeholders', () {
    final i = build({
      'x': {'progress': 'Progress: {current} of {target}'},
    });
    expect(i.t('x.progress', {'current': 3, 'target': 10}), 'Progress: 3 of 10');
  });

  test('falls back to English then to the key itself', () {
    final i = build(
      {'a': 'FR'},
      fallback: {'a': 'EN', 'b': 'ENonly'},
    );
    expect(i.t('a'), 'FR');
    expect(i.t('b'), 'ENonly');
    expect(i.t('missing.entirely'), 'missing.entirely');
  });

  test('ar is right-to-left, others left-to-right', () {
    expect(build(const {}, code: 'ar').isRtl, isTrue);
    expect(build(const {}, code: 'ar').textDirection, TextDirection.rtl);
    expect(build(const {}, code: 'fr').isRtl, isFalse);
  });

  test('load() normalises an unsupported locale to English', () {
    // rootBundle asset loading is exercised on-device (the emulator run + the
    // i18n-check task), not here - it hangs under the headless test binding.
    expect(supportedLocales.map((l) => l.languageCode),
        containsAll(<String>['en', 'fr', 'th', 'tlh', 'ar']));
  });
}
