import 'dart:convert';
import 'dart:io';
import 'package:nostragoalus_parity/dispatch.dart';
import 'package:nostragoalus_parity/harness.dart';
import 'package:test/test.dart';

// The TS side owns the vectors (tests/parity/vectors/*.json); read them in place
// so the two stacks can never diverge on the file. `dart test` runs with the
// package root as CWD, so this is repo-root/tests/parity/vectors.
const vectorsDir = '../../tests/parity/vectors';

void main() {
  final files = Directory(vectorsDir)
      .listSync()
      .whereType<File>()
      .where((f) => f.path.endsWith('.json'))
      .toList();

  for (final file in files) {
    final vf = loadVectors(file.path);

    if (notYetImplemented.contains(vf.module)) {
      test('${vf.module}', () {}, skip: 'Dart port not wired - see dispatch.dart');
      continue;
    }

    group(vf.module, () {
      for (var i = 0; i < vf.cases.length; i++) {
        final c = vf.cases[i];
        test('${c.fn} #$i', () {
          final actual = dispatch(vf.module, c.fn, c.args);
          expect(
            deepEquals(actual, c.expected),
            isTrue,
            reason: '${c.fn}(${jsonEncode(c.args)})\n'
                '  expected: ${jsonEncode(c.expected)}\n'
                '  actual:   ${jsonEncode(actual)}',
          );
        });
      }
    });
  }
}
