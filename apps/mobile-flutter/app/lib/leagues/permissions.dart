/// Client mirror of `apps/web-nuxt/server/utils/leagues/permissions.ts` plus the
/// owner-only role rules the routes enforce. The server is authoritative; this
/// exists so the UI never offers an action that is going to 403.
library;

import '../api/models.gen.dart';

bool canManageLeague(RoleValue? role) =>
    role == RoleValue.owner || role == RoleValue.moderator;

bool canKick(RoleValue? actor, RoleValue? target) {
  if (actor == RoleValue.owner) {
    return target == RoleValue.moderator || target == RoleValue.member;
  }
  if (actor == RoleValue.moderator) return target == RoleValue.member;
  return false;
}

bool canSeeJoinCode(RoleValue? role) => canManageLeague(role);

/// `PUT /api/leagues/[id]/members/[userId]` requires OWNER.
bool canChangeRole(RoleValue? actor, RoleValue? target) =>
    actor == RoleValue.owner &&
    (target == RoleValue.member || target == RoleValue.moderator);

/// Ownership moves through the transfer endpoint, owner only.
bool canTransferOwnership(RoleValue? actor, RoleValue? target) =>
    actor == RoleValue.owner && target != RoleValue.owner;
