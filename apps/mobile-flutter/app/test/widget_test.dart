import 'package:flutter_test/flutter_test.dart';

import 'package:nostragoalus/main.dart';

void main() {
  testWidgets('spike app renders the auth probe launcher', (tester) async {
    await tester.pumpWidget(const SpikeApp());

    expect(find.text('Phase 0 - auth spike'), findsOneWidget);
    expect(find.text('Run auth probe'), findsOneWidget);
  });
}
