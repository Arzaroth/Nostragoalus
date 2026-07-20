/// Client mirror of `apps/web-nuxt/server/utils/leagues/permissions.ts` plus the
/// owner-only role rules the routes enforce. The server is authoritative; this
/// exists so the UI never offers an action that is going to 403.
library;

bool canManageLeague(String? role) => role == 'OWNER' || role == 'MODERATOR';

bool canKick(String? actor, String? target) {
  if (actor == 'OWNER') return target == 'MODERATOR' || target == 'MEMBER';
  if (actor == 'MODERATOR') return target == 'MEMBER';
  return false;
}

bool canSeeJoinCode(String? role) => canManageLeague(role);

/// `PUT /api/leagues/[id]/members/[userId]` requires OWNER.
bool canChangeRole(String? actor, String? target) =>
    actor == 'OWNER' && (target == 'MEMBER' || target == 'MODERATOR');

/// Ownership moves through the transfer endpoint, owner only.
bool canTransferOwnership(String? actor, String? target) =>
    actor == 'OWNER' && target != 'OWNER';
