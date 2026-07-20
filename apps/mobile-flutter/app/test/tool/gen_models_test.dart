import 'package:flutter_test/flutter_test.dart';

import '../../tool/gen_models.dart';

/// A one-operation snapshot around [schema] (and optional request [body]).
Map<String, dynamic> snapshot(
  String path,
  Map<String, dynamic> schema, {
  String method = 'get',
  Map<String, dynamic>? body,
}) =>
    {
      'paths': {
        path: {
          method: {
            'responses': {
              '200': {
                'content': {
                  'application/json': {'schema': schema},
                },
              },
            },
            if (body != null)
              'requestBody': {
                'content': {
                  'application/json': {'schema': body},
                },
              },
          },
        },
      },
    };

Map<String, dynamic> obj(Map<String, dynamic> props, {List<String> required = const []}) =>
    {'type': 'object', 'properties': props, 'required': required};

void main() {
  test('an optional field is omitted from toJson, a nullable one is emitted', () {
    final src = generate(
      snapshot(
        '/x',
        obj({
          'must': {'type': 'string'},
          'opt': {'type': 'string'},
          'nul': {'nullable': true, 'type': 'string'},
          'both': {'nullable': true, 'type': 'string'},
        }, required: ['must', 'nul']),
      ),
      const [Target('get', '/x', 'X')],
    );

    expect(src, contains("'must': must,"));
    expect(src, contains("if (opt != null) 'opt': opt,"));
    expect(src, contains("'nul': nul,"));
    expect(src, contains("'both': both,"));
    expect(src, isNot(contains("if (nul != null)")));
    expect(src, isNot(contains("if (both != null)")));
    // A nullable-but-required field still carries `?` and is not a required arg.
    expect(src, contains('final String? nul;'));
    expect(src, contains('required this.must,'));
    expect(src, contains('this.nul,'));
  });

  test('date-time becomes DateTime, number becomes double, integer int', () {
    final src = generate(
      snapshot(
        '/x',
        obj({
          'at': {'type': 'string', 'format': 'date-time'},
          'ratio': {'type': 'number'},
          'count': {'type': 'integer'},
        }, required: ['at', 'ratio', 'count']),
      ),
      const [Target('get', '/x', 'X')],
    );

    expect(src, contains('final DateTime at;'));
    expect(src, contains("at: DateTime.parse(json['at'] as String),"));
    expect(src, contains("'at': at.toIso8601String(),"));
    expect(src, contains('final double ratio;'));
    expect(src, contains("ratio: (json['ratio'] as num).toDouble(),"));
    expect(src, contains('final int count;'));
  });

  test('additionalProperties: a scalar map copies eagerly, an object map builds items', () {
    final src = generate(
      snapshot(
        '/x',
        obj({
          'flags': {'type': 'object', 'additionalProperties': {'type': 'boolean'}},
          'totals': {
            'type': 'object',
            'additionalProperties': obj({'home': {'type': 'integer'}}, required: ['home']),
          },
        }, required: ['flags', 'totals']),
      ),
      const [Target('get', '/x', 'X')],
    );

    expect(src, contains('final Map<String, bool> flags;'));
    expect(src, contains("flags: Map<String, bool>.from(json['flags'] as Map),"));
    expect(src, isNot(contains('.cast()')));
    expect(src, contains('final Map<String, Total> totals;'));
    expect(src, contains('class Total {'));
    expect(src, contains("MapEntry(k as String, Total.fromJson(e as Map<String, dynamic>))"));
    expect(src, contains("'totals': totals.map((k, e) => MapEntry(k, e.toJson())),"));
  });

  test('a union stays dynamic and a list of unions stays List<dynamic>', () {
    final src = generate(
      snapshot(
        '/x',
        obj({
          'urls': {
            'anyOf': [
              {'type': 'string'},
              {'type': 'array', 'items': {'type': 'string'}},
            ],
          },
          'many': {
            'type': 'array',
            'items': {
              'oneOf': [
                {'type': 'string'},
                {'type': 'integer'},
              ],
            },
          },
        }, required: ['urls', 'many']),
      ),
      const [Target('get', '/x', 'X')],
    );

    expect(src, contains('final dynamic urls;'));
    expect(src, contains('final List<dynamic> many;'));
  });

  test('a list of objects emits the singularised item class', () {
    final src = generate(
      snapshot(
        '/x',
        obj({
          'countries': {
            'type': 'array',
            'items': obj({'code': {'type': 'string'}}, required: ['code']),
          },
        }, required: ['countries']),
      ),
      const [Target('get', '/x', 'X')],
    );

    expect(src, contains('class Country {'));
    expect(src, contains('final List<Country> countries;'));
    expect(
      src,
      contains("(json['countries'] as List).map((e) => Country.fromJson(e as Map<String, dynamic>))"),
    );
  });

  test('an enum field keeps its String type and exposes the contract values', () {
    final src = generate(
      snapshot(
        '/x',
        obj({
          'mode': {'type': 'string', 'enum': ['EASY', 'HARD']},
        }, required: ['mode']),
      ),
      const [Target('get', '/x', 'X')],
    );

    expect(src, contains('final String mode;'));
    expect(src, contains("static const modeValues = <String>['EASY', 'HARD'];"));
  });

  test('two structurally identical targets collapse, and the alias emits a typedef', () {
    final shape = obj({'id': {'type': 'string'}}, required: ['id']);
    final snap = {
      'paths': {
        '/a': {
          'get': {
            'responses': {
              '200': {
                'content': {
                  'application/json': {'schema': shape},
                },
              },
            },
          },
        },
        '/b': {
          'get': {
            'responses': {
              '200': {
                'content': {
                  'application/json': {'schema': shape},
                },
              },
            },
          },
        },
      },
    };

    final src = generate(snap, const [
      Target('get', '/a', 'A'),
      Target('get', '/b', 'B', aliasExpected: true),
    ]);
    expect(src, contains('class A {'));
    expect(src, isNot(contains('class B {')));
    expect(src, contains('typedef B = A;'));

    // Undeclared, the same collapse is a hard failure instead of a silent drop.
    expect(
      () => generate(snap, const [Target('get', '/a', 'A'), Target('get', '/b', 'B')]),
      throwsA(isA<GenError>()),
    );
    // A declared alias that no longer collapses is just as wrong.
    expect(
      () => generate(snap, const [Target('get', '/a', 'A', aliasExpected: true)]),
      throwsA(isA<GenError>()),
    );
  });

  test('a missing endpoint fails the generator instead of warning', () {
    expect(
      () => generate(snapshot('/x', obj(const {})), const [Target('get', '/nope', 'X')]),
      throwsA(isA<GenError>()),
    );
  });

  test('a name collision takes the parent prefix, never an ordering counter', () {
    final src = generate(
      snapshot(
        '/x',
        obj({
          'home': obj({'a': {'type': 'string'}}, required: ['a']),
          'nested': obj({
            'home': obj({'b': {'type': 'string'}}, required: ['b']),
          }, required: ['home']),
        }, required: ['home', 'nested']),
      ),
      const [Target('get', '/x', 'X')],
    );

    expect(src, contains('class Home {'));
    expect(src, contains('class NestedHome {'));
    expect(src, isNot(contains('class Home2 {')));
  });

  test('a class name that would be ambiguous with a Flutter widget is qualified', () {
    final src = generate(
      snapshot(
        '/x',
        obj({
          'rows': {
            'type': 'array',
            'items': obj({'a': {'type': 'string'}}, required: ['a']),
          },
        }, required: ['rows']),
      ),
      const [Target('get', '/x', 'X')],
    );

    expect(src, contains('class XRow {'));
    expect(src, isNot(contains('class Row {')));
  });

  test('a root-array response emits the item class plus a list parser', () {
    final src = generate(
      snapshot('/x', {
        'type': 'array',
        'items': obj({'id': {'type': 'string'}}, required: ['id']),
      }),
      const [Target('get', '/x', 'Item', rootList: true)],
    );

    expect(src, contains('class Item {'));
    expect(src, contains('List<Item> parseItemList(dynamic json) =>'));
  });

  test('a request body is emitted under its own name', () {
    final src = generate(
      snapshot(
        '/x',
        obj({'id': {'type': 'string'}}, required: ['id']),
        method: 'post',
        body: obj({'name': {'type': 'string'}}, required: ['name']),
      ),
      const [Target('post', '/x', 'XResponse', reqName: 'XInput')],
    );

    expect(src, contains('class XInput {'));
    expect(src, contains('class XResponse {'));
  });
}
