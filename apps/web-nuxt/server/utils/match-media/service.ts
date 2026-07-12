import { and, asc, eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, matchMedia } from '../../../db/schema'
import { NotFoundError, ValidationError } from '../errors'
import { isValidStreamUrl, resolveEmbeddable, sanitizeAllow, type MatchMediaItem, type MatchMediaKind } from '../../../shared/match-media'

export interface AddMatchMediaInput {
  matchId: string
  kind: MatchMediaKind
  url: string
  label?: string | null
  embeddable?: boolean | null
  // Per-link iframe overrides (null = default): sandbox true = force the player
  // sandbox, false = emit none (hosts that refuse sandboxing); allow = a custom
  // feature-policy, sanitised to bare tokens here so the column never holds
  // anything that could alter the iframe markup.
  sandbox?: boolean | null
  allow?: string | null
}

// Resolved for rendering: `embeddable` is override ?? whitelist default, so the
// stored nullable override never leaks past the service.
export async function listMatchMedia(db: AppDatabase, matchId: string): Promise<MatchMediaItem[]> {
  const rows = await db
    .select({
      id: matchMedia.id,
      kind: matchMedia.kind,
      url: matchMedia.url,
      label: matchMedia.label,
      embeddable: matchMedia.embeddable,
      sandbox: matchMedia.sandbox,
      allow: matchMedia.allow,
    })
    .from(matchMedia)
    .where(eq(matchMedia.matchId, matchId))
    .orderBy(asc(matchMedia.kind), asc(matchMedia.createdAt), asc(matchMedia.id))
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    url: r.url,
    label: r.label,
    embeddable: resolveEmbeddable(r.url, r.embeddable),
    sandbox: r.sandbox,
    allow: r.allow,
  }))
}

export async function addMatchMedia(db: AppDatabase, input: AddMatchMediaInput) {
  if (!isValidStreamUrl(input.url)) throw new ValidationError('stream url must be a valid https URL')
  const [m] = await db.select({ id: match.id }).from(match).where(eq(match.id, input.matchId)).limit(1)
  if (!m) throw new NotFoundError('match not found')
  const [row] = await db
    .insert(matchMedia)
    .values({
      matchId: input.matchId,
      kind: input.kind,
      url: input.url,
      label: input.label ?? null,
      embeddable: input.embeddable ?? null,
      sandbox: input.sandbox ?? null,
      allow: sanitizeAllow(input.allow),
    })
    .returning()
  return row
}

// Scoped to the addressed match so a link can only be deleted through its own
// match's route (the [id] path param is load-bearing, not decorative).
export async function deleteMatchMedia(db: AppDatabase, matchId: string, mediaId: string): Promise<void> {
  const deleted = await db
    .delete(matchMedia)
    .where(and(eq(matchMedia.id, mediaId), eq(matchMedia.matchId, matchId)))
    .returning({ id: matchMedia.id })
  if (deleted.length === 0) throw new NotFoundError('media not found')
}

// A LIVE link on an over match is dead - the stream is gone. Cleared on finalize
// so it doesn't linger in the table (the UI already hides LIVE media once a match
// is over; this is housekeeping that doesn't depend on the bot running). "Over"
// matches visibleMediaForStatus: FINISHED or AWARDED (walkover/forfeit).
// Returns how many were removed.
export async function pruneLiveMediaForFinishedMatches(db: AppDatabase): Promise<number> {
  const finishedIds = db.select({ id: match.id }).from(match).where(inArray(match.status, ['FINISHED', 'AWARDED']))
  const deleted = await db
    .delete(matchMedia)
    .where(and(eq(matchMedia.kind, 'LIVE'), inArray(matchMedia.matchId, finishedIds)))
    .returning({ id: matchMedia.id })
  return deleted.length
}
