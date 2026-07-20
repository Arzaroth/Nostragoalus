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

  group('load()', () {
    final asked = <String>[];
    Future<String> reader(String key) async {
      asked.add(key);
      final code = key.split('/').last.split('.').first;
      return '{"a":"[$code]"}';
    }

    setUp(asked.clear);

    test('normalises an unsupported locale to English', () async {
      final i = await I18n.load(const Locale('de'), readAsset: reader);
      expect(i.locale, const Locale('en'));
      expect(asked, ['assets/i18n/en.json']);
      expect(i.t('a'), '[en]');
    });

    test('a supported locale loads its own file plus the English fallback', () async {
      final i = await I18n.load(const Locale('th'), readAsset: reader);
      expect(i.locale, const Locale('th'));
      expect(asked, ['assets/i18n/th.json', 'assets/i18n/en.json']);
    });

    test('English is read once, not twice', () async {
      await I18n.load(const Locale('en'), readAsset: reader);
      expect(asked, ['assets/i18n/en.json']);
    });

    test('every shipped locale is loadable', () async {
      for (final l in supportedLocales) {
        expect((await I18n.load(l, readAsset: reader)).locale, l);
      }
    });
  });
}
