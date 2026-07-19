import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/voice/voice_mesh.dart';

void main() {
  test('exactly one side of a pair offers', () {
    expect(shouldOffer('a', 'b'), isTrue);
    expect(shouldOffer('b', 'a'), isFalse);
    expect(shouldOffer('a', 'b') == shouldOffer('b', 'a'), isFalse);
  });

  test('call-established rule differs for dm vs league', () {
    expect(isCallEstablished('dm', 1), isFalse);
    expect(isCallEstablished('dm', 2), isTrue);
    expect(isCallEstablished('league', 1), isTrue);
  });

  test('rosterDelta adds new peers, removes gone ones, never self', () {
    final d = rosterDelta(['b'], ['self', 'b', 'c'], 'self');
    expect(d.added, ['c']);
    expect(d.removed, isEmpty);

    final d2 = rosterDelta(['b', 'c'], ['self', 'b'], 'self');
    expect(d2.added, isEmpty);
    expect(d2.removed, ['c']);
  });

  test('call duration formats m:ss then h:mm:ss', () {
    expect(formatCallDuration(9), '0:09');
    expect(formatCallDuration(8 * 60 + 23), '8:23');
    expect(formatCallDuration(3600 + 7 * 60 + 39), '1:07:39');
  });
}
