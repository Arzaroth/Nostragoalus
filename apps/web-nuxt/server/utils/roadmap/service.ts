import { and, asc, count, eq, max, ne } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { roadmapItem, roadmapModerationEnum, roadmapStatusEnum, roadmapVote } from '../../../db/schema'
import { ConflictError, NotFoundError, ValidationError } from '../errors'

export type RoadmapStatus = (typeof roadmapStatusEnum.enumValues)[number]
export type RoadmapModeration = (typeof roadmapModerationEnum.enumValues)[number]

export const ROADMAP_STATUSES = roadmapStatusEnum.enumValues

// User suggestions land here; zod mirrors these on the route.
export const SUGGESTION_TITLE_MIN = 3
export const SUGGESTION_TITLE_MAX = 120
export const SUGGESTION_DESCRIPTION_MAX = 2000

export interface RoadmapItemInput {
  title: string
  description?: string | null
  status?: RoadmapStatus
}

export interface RoadmapItemPatch {
  title?: string
  description?: string | null
  status?: RoadmapStatus
  position?: number
  moderationStatus?: RoadmapModeration
}

export interface SuggestionInput {
  authorId: string
  title: string
  description?: string | null
}

// A roadmap row plus its derived upvote tally and whether the viewer upvoted it.
export interface RoadmapItemView {
  id: string
  title: string
  description: string | null
  status: RoadmapStatus
  position: number
  authorId: string | null
  moderationStatus: RoadmapModeration
  voteCount: number
  viewerHasVoted: boolean
  updatedAt: Date
}

export interface ListRoadmapOptions {
  // Signed-in viewer, for per-item viewerHasVoted (null/undefined => all false).
  viewerId?: string | null
  // Admin view: include REJECTED (hidden) items so they can be un-hidden.
  includeHidden?: boolean
}

// position is per-status (each column restarts at 0), so order by status first,
// then position, with createdAt as a stable tiebreak. Vote counts and the
// viewer's votes are folded in from two small companion queries rather than a
// join+group, keeping the row shape flat and the counts easy to reason about.
export async function listRoadmapItems(
  db: AppDatabase,
  opts: ListRoadmapOptions = {},
): Promise<RoadmapItemView[]> {
  const rows = await db
    .select()
    .from(roadmapItem)
    .where(opts.includeHidden ? undefined : ne(roadmapItem.moderationStatus, 'REJECTED'))
    .orderBy(asc(roadmapItem.status), asc(roadmapItem.position), asc(roadmapItem.createdAt))

  const counts = await db
    .select({ itemId: roadmapVote.roadmapItemId, c: count() })
    .from(roadmapVote)
    .groupBy(roadmapVote.roadmapItemId)
  const countByItem = new Map(counts.map((r) => [r.itemId, Number(r.c)]))

  let votedByViewer = new Set<string>()
  if (opts.viewerId) {
    const mine = await db
      .select({ itemId: roadmapVote.roadmapItemId })
      .from(roadmapVote)
      .where(eq(roadmapVote.userId, opts.viewerId))
    votedByViewer = new Set(mine.map((r) => r.itemId))
  }

  return rows.map((r) => ({
    ...r,
    voteCount: countByItem.get(r.id) ?? 0,
    viewerHasVoted: votedByViewer.has(r.id),
  }))
}

async function nextPosition(db: AppDatabase, status: RoadmapStatus): Promise<number> {
  const [{ last }] = await db
    .select({ last: max(roadmapItem.position) })
    .from(roadmapItem)
    .where(eq(roadmapItem.status, status))
  return (last ?? -1) + 1
}

export async function createRoadmapItem(db: AppDatabase, input: RoadmapItemInput) {
  const title = input.title.trim()
  if (!title) throw new ValidationError('title is required')
  const status = input.status ?? 'PLANNED'
  const [row] = await db
    .insert(roadmapItem)
    .values({
      title,
      description: input.description?.trim() || null,
      status,
      position: await nextPosition(db, status), // append at the end of the column
    })
    .returning()
  return row
}

// A community suggestion: authored by a signed-in user, lands in the SUGGESTED
// column. Hybrid moderation: it is publicly visible and upvotable immediately
// but PENDING ("under review") until an admin blesses it to APPROVED. Admins
// hide spam by flipping to REJECTED (which drops it from the public view).
export async function createSuggestion(db: AppDatabase, input: SuggestionInput) {
  const title = input.title.trim()
  if (title.length < SUGGESTION_TITLE_MIN) throw new ValidationError('title is too short')
  if (title.length > SUGGESTION_TITLE_MAX) throw new ValidationError('title is too long')
  const [row] = await db
    .insert(roadmapItem)
    .values({
      title,
      description: input.description?.trim() || null,
      status: 'SUGGESTED',
      moderationStatus: 'PENDING',
      authorId: input.authorId,
      position: await nextPosition(db, 'SUGGESTED'),
    })
    .returning()
  return row
}

// Toggle the caller's upvote on an item and return the fresh tally. Rejected
// (hidden) items can't be voted on. We check-then-write inside a transaction so
// voted/voteCount stay consistent, and the insert is onConflictDoNothing against
// the (itemId, userId) unique index so a concurrent double-tap resolves to a
// single vote instead of a unique-violation 500.
export async function toggleVote(
  db: AppDatabase,
  input: { itemId: string; userId: string },
): Promise<{ voted: boolean; voteCount: number }> {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: roadmapItem.id,
        status: roadmapItem.status,
        moderationStatus: roadmapItem.moderationStatus,
      })
      .from(roadmapItem)
      .where(eq(roadmapItem.id, input.itemId))
      .limit(1)
    if (!item || item.moderationStatus === 'REJECTED') throw new NotFoundError('roadmap item not found')
    // Voting is a signal for what to build next, so it closes once an idea is
    // being built (IN_PROGRESS) or done (SHIPPED) - upvotes there are noise.
    if (item.status === 'IN_PROGRESS' || item.status === 'SHIPPED') {
      throw new ConflictError('voting is closed for this item')
    }

    const [existing] = await tx
      .select({ id: roadmapVote.id })
      .from(roadmapVote)
      .where(and(eq(roadmapVote.roadmapItemId, input.itemId), eq(roadmapVote.userId, input.userId)))
      .limit(1)

    let voted: boolean
    if (existing) {
      await tx.delete(roadmapVote).where(eq(roadmapVote.id, existing.id))
      voted = false
    } else {
      await tx.insert(roadmapVote).values({ roadmapItemId: input.itemId, userId: input.userId }).onConflictDoNothing()
      voted = true
    }

    const [{ c }] = await tx
      .select({ c: count() })
      .from(roadmapVote)
      .where(eq(roadmapVote.roadmapItemId, input.itemId))
    return { voted, voteCount: Number(c) }
  })
}

// Promotion blesses a suggestion: moving it onto the roadmap proper (any non-
// SUGGESTED status) approves a still-PENDING or previously-REJECTED item, so it
// stops being hidden from the public list. Returns 'APPROVED' to set, or undefined
// to leave moderation unchanged. Shared by updateRoadmapItem (the status Select)
// and reorderColumn (the drag), so the two promotion paths never diverge.
export function blessedModerationOnPromote(
  targetStatus: RoadmapStatus,
  current: RoadmapModeration,
): RoadmapModeration | undefined {
  return targetStatus !== 'SUGGESTED' && current !== 'APPROVED' ? 'APPROVED' : undefined
}

export async function updateRoadmapItem(db: AppDatabase, id: string, patch: RoadmapItemPatch) {
  if (patch.title !== undefined && !patch.title.trim()) throw new ValidationError('title cannot be empty')
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(roadmapItem).where(eq(roadmapItem.id, id)).limit(1)
    if (!current) throw new NotFoundError('roadmap item not found')

    const set: RoadmapItemPatch = {
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
      ...(patch.moderationStatus !== undefined ? { moderationStatus: patch.moderationStatus } : {}),
    }
    if (patch.status !== undefined) {
      set.status = patch.status
      // Moving to a different column: append at its end so positions stay unique
      // per status (unless the caller pinned an explicit position).
      if (patch.status !== current.status && patch.position === undefined) {
        set.position = await nextPosition(tx, patch.status)
      }
      // Promoting a suggestion onto the roadmap proper blesses it (see
      // blessedModerationOnPromote); an explicit moderationStatus in the same
      // patch wins over the auto-bless.
      if (patch.moderationStatus === undefined) {
        const blessed = blessedModerationOnPromote(patch.status, current.moderationStatus)
        if (blessed) set.moderationStatus = blessed
      }
    }
    const [row] = await tx.update(roadmapItem).set(set).where(eq(roadmapItem.id, id)).returning()
    return row
  })
}

// Persist an explicit ordering for a whole status column (the kanban drag-drop):
// every id in `ids` is placed in `status` at its array index. A card dragged in
// from another column has its status rewritten here, and a suggestion dragged onto
// the roadmap proper is auto-approved via the shared blessedModerationOnPromote
// rule (so the drag path matches the status-Select path exactly). Unknown ids are
// skipped. The source column an item left keeps its positions (gaps are fine -
// listing orders by position).
export async function reorderColumn(db: AppDatabase, status: RoadmapStatus, ids: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      const set: { status: RoadmapStatus; position: number; moderationStatus?: RoadmapModeration } = {
        status,
        position: i,
      }
      if (status !== 'SUGGESTED') {
        const [cur] = await tx
          .select({ moderationStatus: roadmapItem.moderationStatus })
          .from(roadmapItem)
          .where(eq(roadmapItem.id, ids[i]))
          .limit(1)
        const blessed = cur ? blessedModerationOnPromote(status, cur.moderationStatus) : undefined
        if (blessed) set.moderationStatus = blessed
      }
      await tx.update(roadmapItem).set(set).where(eq(roadmapItem.id, ids[i]))
    }
  })
}

export async function deleteRoadmapItem(db: AppDatabase, id: string) {
  const [row] = await db.delete(roadmapItem).where(eq(roadmapItem.id, id)).returning({ id: roadmapItem.id })
  if (!row) throw new NotFoundError('roadmap item not found')
}
