import { asc, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, matchMedia } from '../../../db/schema'
import { NotFoundError, ValidationError } from '../errors'
import { isValidStreamUrl, resolveEmbeddable, type MatchMediaItem, type MatchMediaKind } from '../../../shared/match-media'

export interface AddMatchMediaInput {
  matchId: string
  kind: MatchMediaKind
  url: string
  label?: string | null
  embeddable?: boolean | null
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
    })
    .from(matchMedia)
    .where(eq(matchMedia.matchId, matchId))
    .orderBy(asc(matchMedia.kind), asc(matchMedia.createdAt))
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    url: r.url,
    label: r.label,
    embeddable: resolveEmbeddable(r.url, r.embeddable),
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
    })
    .returning()
  return row
}

export async function deleteMatchMedia(db: AppDatabase, mediaId: string): Promise<void> {
  const deleted = await db.delete(matchMedia).where(eq(matchMedia.id, mediaId)).returning({ id: matchMedia.id })
  if (deleted.length === 0) throw new NotFoundError('media not found')
}
