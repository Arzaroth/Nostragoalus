import { and, asc, desc, eq, gt, lt, max } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { roadmapItem, roadmapStatusEnum } from '../../../db/schema'
import { NotFoundError, ValidationError } from '../errors'

export type RoadmapStatus = (typeof roadmapStatusEnum.enumValues)[number]

export const ROADMAP_STATUSES = roadmapStatusEnum.enumValues

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
}

// position is per-status (each column restarts at 0), so order by status first,
// then position, with createdAt as a stable tiebreak.
export async function listRoadmapItems(db: AppDatabase) {
  return db
    .select()
    .from(roadmapItem)
    .orderBy(asc(roadmapItem.status), asc(roadmapItem.position), asc(roadmapItem.createdAt))
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

export async function updateRoadmapItem(db: AppDatabase, id: string, patch: RoadmapItemPatch) {
  if (patch.title !== undefined && !patch.title.trim()) throw new ValidationError('title cannot be empty')
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(roadmapItem).where(eq(roadmapItem.id, id)).limit(1)
    if (!current) throw new NotFoundError('roadmap item not found')

    const set: RoadmapItemPatch = {
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
    }
    if (patch.status !== undefined) {
      set.status = patch.status
      // Moving to a different column: append at its end so positions stay unique
      // per status (unless the caller pinned an explicit position).
      if (patch.status !== current.status && patch.position === undefined) {
        set.position = await nextPosition(tx, patch.status)
      }
    }
    const [row] = await tx.update(roadmapItem).set(set).where(eq(roadmapItem.id, id)).returning()
    return row
  })
}

// Swap an item with its adjacent neighbor in the same status column, atomically.
export async function reorderRoadmapItem(db: AppDatabase, id: string, direction: 'up' | 'down') {
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(roadmapItem).where(eq(roadmapItem.id, id)).limit(1)
    if (!item) throw new NotFoundError('roadmap item not found')
    const [neighbor] = await tx
      .select()
      .from(roadmapItem)
      .where(
        and(
          eq(roadmapItem.status, item.status),
          direction === 'up' ? lt(roadmapItem.position, item.position) : gt(roadmapItem.position, item.position),
        ),
      )
      .orderBy(direction === 'up' ? desc(roadmapItem.position) : asc(roadmapItem.position))
      .limit(1)
    if (!neighbor) return item // already at the edge - no-op
    await tx.update(roadmapItem).set({ position: neighbor.position }).where(eq(roadmapItem.id, item.id))
    await tx.update(roadmapItem).set({ position: item.position }).where(eq(roadmapItem.id, neighbor.id))
    return { ...item, position: neighbor.position }
  })
}

export async function deleteRoadmapItem(db: AppDatabase, id: string) {
  const [row] = await db.delete(roadmapItem).where(eq(roadmapItem.id, id)).returning({ id: roadmapItem.id })
  if (!row) throw new NotFoundError('roadmap item not found')
}
