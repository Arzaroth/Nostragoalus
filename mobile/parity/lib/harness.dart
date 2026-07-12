import 'dart:convert';
import 'dart:io';

// Loads a frozen vector file (the SAME JSON the TS side writes under
// tests/parity/vectors) and compares Dart results to the frozen `expected`.
// Structural deep-equality on decoded JSON, so map key order is irrelevant and
// an int that reads back as a double still matches.

class VectorFile {
  VectorFile(this.module, this.cases);
  final String module;
  final List<VectorCase> cases;
}

class VectorCase {
  VectorCase(this.fn, this.args, this.expected);
  final String fn;
  final List args;
  final dynamic expected;
}

VectorFile loadVectors(String path) {
  final json = jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;
  final cases = (json['cases'] as List)
      .map((c) => VectorCase(c['fn'] as String, c['args'] as List, c['expected']))
      .toList();
  return VectorFile(json['module'] as String, cases);
}

bool deepEquals(dynamic a, dynamic b) {
  if (a is num && b is num) return a == b;
  if (a is Map && b is Map) {
    if (a.length != b.length) return false;
    for (final k in a.keys) {
      if (!b.containsKey(k) || !deepEquals(a[k], b[k])) return false;
    }
    return true;
  }
  if (a is List && b is List) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i])) return false;
    }
    return true;
  }
  return a == b;
}
