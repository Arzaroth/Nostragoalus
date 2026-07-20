import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/leagues/permissions.dart';

void main() {
  group('canManageLeague', () {
    test('owner and moderator manage, member does not', () {
      expect(canManageLeague('OWNER'), isTrue);
      expect(canManageLeague('MODERATOR'), isTrue);
      expect(canManageLeague('MEMBER'), isFalse);
      expect(canManageLeague(null), isFalse);
    });
  });

  group('canKick', () {
    // Same table as server/utils/leagues/permissions.ts.
    const cases = {
      ('OWNER', 'OWNER'): false,
      ('OWNER', 'MODERATOR'): true,
      ('OWNER', 'MEMBER'): true,
      ('MODERATOR', 'OWNER'): false,
      ('MODERATOR', 'MODERATOR'): false,
      ('MODERATOR', 'MEMBER'): true,
      ('MEMBER', 'MEMBER'): false,
      (null, 'MEMBER'): false,
    };
    cases.forEach((pair, expected) {
      test('${pair.$1} kicking ${pair.$2} -> $expected', () {
        expect(canKick(pair.$1, pair.$2), expected);
      });
    });
  });

  group('role changes', () {
    test('only the owner promotes or demotes, and never the owner', () {
      expect(canChangeRole('OWNER', 'MEMBER'), isTrue);
      expect(canChangeRole('OWNER', 'MODERATOR'), isTrue);
      expect(canChangeRole('OWNER', 'OWNER'), isFalse);
      expect(canChangeRole('MODERATOR', 'MEMBER'), isFalse);
      expect(canChangeRole(null, 'MEMBER'), isFalse);
    });

    test('only the owner transfers ownership', () {
      expect(canTransferOwnership('OWNER', 'MEMBER'), isTrue);
      expect(canTransferOwnership('OWNER', 'MODERATOR'), isTrue);
      expect(canTransferOwnership('OWNER', 'OWNER'), isFalse);
      expect(canTransferOwnership('MODERATOR', 'MEMBER'), isFalse);
    });
  });

  test('canSeeJoinCode follows canManageLeague', () {
    expect(canSeeJoinCode('MODERATOR'), isTrue);
    expect(canSeeJoinCode('MEMBER'), isFalse);
  });
}
