import { asc, eq, max } from 'drizzle-orm'
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

export async function listRoadmapItems(db: AppDatabase) {
  return db
    .select()
    .from(roadmapItem)
    .orderBy(asc(roadmapItem.position), asc(roadmapItem.createdAt))
}

export async function createRoadmapItem(db: AppDatabase, input: RoadmapItemInput) {
  const title = input.title.trim()
  if (!title) throw new ValidationError('title is required')
  const status = input.status ?? 'PLANNED'
  // Append at the end of the status column.
  const [{ last }] = await db
    .select({ last: max(roadmapItem.position) })
    .from(roadmapItem)
    .where(eq(roadmapItem.status, status))
  const [row] = await db
    .insert(roadmapItem)
    .values({
      title,
      description: input.description?.trim() || null,
      status,
      position: (last ?? -1) + 1,
    })
    .returning()
  return row
}

export async function updateRoadmapItem(db: AppDatabase, id: string, patch: RoadmapItemPatch) {
  if (patch.title !== undefined && !patch.title.trim()) throw new ValidationError('title cannot be empty')
  const [row] = await db
    .update(roadmapItem)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
    })
    .where(eq(roadmapItem.id, id))
    .returning()
  if (!row) throw new NotFoundError('roadmap item not found')
  return row
}

export async function deleteRoadmapItem(db: AppDatabase, id: string) {
  const [row] = await db.delete(roadmapItem).where(eq(roadmapItem.id, id)).returning({ id: roadmapItem.id })
  if (!row) throw new NotFoundError('roadmap item not found')
}
