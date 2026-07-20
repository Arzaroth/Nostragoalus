import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// `I18n.t` falls through to the dotted key when it resolves to anything other
/// than a String, so a key that names a namespace OBJECT renders literally in
/// the UI ("roadmap.suggest"). Two of those shipped. This walks every static
/// `tr('...')` literal in lib/ and proves it resolves to a String in en.json.
void main() {
  test('every static tr() key resolves to a string in en.json', () {
    final en = jsonDecode(File('assets/i18n/en.json').readAsStringSync()) as Map<String, dynamic>;

    Object? lookup(String dotted) {
      Object? cur = en;
      for (final part in dotted.split('.')) {
        if (cur is Map && cur.containsKey(part)) {
          cur = cur[part];
        } else {
          return null;
        }
      }
      return cur;
    }

    // Interpolated keys (tr('a.$b')) are dynamic and cannot be checked here.
    final literal = RegExp(r"""\btr\(\s*(['"])([A-Za-z0-9_.]+)\1""");
    final missing = <String>{};
    final notAString = <String>{};

    for (final f in Directory('lib').listSync(recursive: true).whereType<File>()) {
      // i18n_scope.dart declares `tr(String key, ...)`; it has no call sites.
      if (!f.path.endsWith('.dart') || f.path.endsWith('i18n_scope.dart')) continue;
      for (final m in literal.allMatches(f.readAsStringSync())) {
        final key = m.group(2)!;
        final value = lookup(key);
        if (value == null) {
          missing.add('$key (${f.path})');
        } else if (value is! String) {
          notAString.add('$key (${f.path}) resolves to a ${value.runtimeType}');
        }
      }
    }

    expect(notAString, isEmpty,
        reason: 'these render as the raw dotted key in the UI');
    expect(missing, isEmpty,
        reason: 'add them to all five shared/i18n-json locales, then re-run tool/sync_shared.sh');
  });
}
