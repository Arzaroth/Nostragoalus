import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/leagues/permissions.dart';

void main() {
  group('canManageLeague', () {
    test('owner and moderator manage, member does not', () {
      expect(canManageLeague(RoleValue.owner), isTrue);
      expect(canManageLeague(RoleValue.moderator), isTrue);
      expect(canManageLeague(RoleValue.member), isFalse);
      expect(canManageLeague(null), isFalse);
    });
  });

  group('canKick', () {
    // Same table as server/utils/leagues/permissions.ts.
    const cases = {
      (RoleValue.owner, RoleValue.owner): false,
      (RoleValue.owner, RoleValue.moderator): true,
      (RoleValue.owner, RoleValue.member): true,
      (RoleValue.moderator, RoleValue.owner): false,
      (RoleValue.moderator, RoleValue.moderator): false,
      (RoleValue.moderator, RoleValue.member): true,
      (RoleValue.member, RoleValue.member): false,
      (null, RoleValue.member): false,
    };
    cases.forEach((pair, expected) {
      test('${pair.$1?.wire} kicking ${pair.$2.wire} -> $expected', () {
        expect(canKick(pair.$1, pair.$2), expected);
      });
    });
  });

  group('role changes', () {
    test('only the owner promotes or demotes, and never the owner', () {
      expect(canChangeRole(RoleValue.owner, RoleValue.member), isTrue);
      expect(canChangeRole(RoleValue.owner, RoleValue.moderator), isTrue);
      expect(canChangeRole(RoleValue.owner, RoleValue.owner), isFalse);
      expect(canChangeRole(RoleValue.moderator, RoleValue.member), isFalse);
      expect(canChangeRole(null, RoleValue.member), isFalse);
    });

    test('only the owner transfers ownership', () {
      expect(canTransferOwnership(RoleValue.owner, RoleValue.member), isTrue);
      expect(canTransferOwnership(RoleValue.owner, RoleValue.moderator), isTrue);
      expect(canTransferOwnership(RoleValue.owner, RoleValue.owner), isFalse);
      expect(canTransferOwnership(RoleValue.moderator, RoleValue.member), isFalse);
    });
  });

  test('canSeeJoinCode follows canManageLeague', () {
    expect(canSeeJoinCode(RoleValue.moderator), isTrue);
    expect(canSeeJoinCode(RoleValue.member), isFalse);
  });
}
