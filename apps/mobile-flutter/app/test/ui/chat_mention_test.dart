import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/chat/chat_providers.dart' show ChatLine;
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/i18n/i18n_scope.dart';
import 'package:nostragoalus/ui/widgets/chat_line_tile.dart';

const _strings = {
  'chat': {'unknownUser': 'Someone', 'undecryptable': '[cannot decrypt]'},
};

ChatLine _line(String text) => ChatLine(
      id: 'm1',
      userId: 'u9',
      text: text,
      createdAt: '2026-07-01T10:00:00.000Z',
      authorName: 'Them',
    );

Widget _host(Widget child) => I18nScope(
      i18n: I18n(_strings, const {}, const Locale('en')),
      child: MaterialApp(home: Scaffold(body: child)),
    );

/// Finds the message body's rendered text, spans flattened the way a reader sees
/// it - `find.text` matches a whole Text widget's data, which a TextSpan tree
/// has none of.
String _body(WidgetTester tester) {
  final rich = tester.widgetList<Text>(find.byType(Text)).firstWhere((t) => t.textSpan != null);
  return rich.textSpan!.toPlainText();
}

void main() {
  Future<void> pump(WidgetTester tester, String text, {Map<String, String> names = const {}}) =>
      tester.pumpWidget(_host(ChatLineTile(
        line: _line(text),
        undecryptableLabel: 'x',
        mentionNames: names,
        unknownMentionLabel: 'Someone',
      )));

  // The wire form stores the id so a rename re-renders. A client that prints it
  // raw shows "@a5f3c1e2-..." where a name belongs, which is what shipped.
  testWidgets('a mention renders as the current display name', (tester) async {
    await pump(tester, 'hey @<u1> look', names: {'u1': 'Alice'});
    expect(_body(tester), 'hey @Alice look');
  });

  testWidgets('several mentions in one message all resolve', (tester) async {
    await pump(tester, '@<u1> and @<u2>', names: {'u1': 'Alice', 'u2': 'Bob'});
    expect(_body(tester), '@Alice and @Bob');
  });

  // A member who left, or an id from another room: the reader gets the localized
  // stand-in rather than a bare id.
  testWidgets('an id nobody knows falls back to the stand-in', (tester) async {
    await pump(tester, 'who is @<ghost>?', names: {'u1': 'Alice'});
    expect(_body(tester), 'who is @Someone?');
  });

  testWidgets('a rename shows the new name for an old message', (tester) async {
    await pump(tester, 'hi @<u1>', names: {'u1': 'Alice'});
    expect(_body(tester), 'hi @Alice');
    await pump(tester, 'hi @<u1>', names: {'u1': 'Alicia'});
    expect(_body(tester), 'hi @Alicia');
  });

  testWidgets('text that only looks like a mention is left alone', (tester) async {
    await pump(tester, 'email me @alice, not @<u1>', names: {'u1': 'Alice'});
    expect(_body(tester), 'email me @alice, not @Alice');
  });

  testWidgets('a message with no mentions renders unchanged', (tester) async {
    await pump(tester, 'just a message');
    expect(_body(tester), 'just a message');
  });

  testWidgets('an undecryptable line still shows its placeholder', (tester) async {
    await tester.pumpWidget(_host(ChatLineTile(
      line: ChatLine(
        id: 'm1',
        userId: 'u9',
        text: null,
        createdAt: '2026-07-01T10:00:00.000Z',
        ),
      undecryptableLabel: '[cannot decrypt]',
    )));
    expect(find.text('[cannot decrypt]'), findsOneWidget);
  });
}
