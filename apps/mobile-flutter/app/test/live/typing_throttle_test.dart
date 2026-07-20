import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/live/typing_throttle.dart';

void main() {
  final t0 = DateTime(2026, 7, 20, 12);

  test('the first keystroke sends, the next ones inside the window do not', () {
    expect(mayNotifyTyping(null, t0), isTrue);
    expect(mayNotifyTyping(t0, t0.add(const Duration(milliseconds: 50))), isFalse);
    expect(mayNotifyTyping(t0, t0.add(const Duration(seconds: 1, milliseconds: 999))), isFalse);
  });

  test('composing past the window sends again, so the hint does not lapse', () {
    expect(mayNotifyTyping(t0, t0.add(typingThrottleInterval)), isTrue);
    expect(mayNotifyTyping(t0, t0.add(const Duration(seconds: 30))), isTrue);
  });
}
