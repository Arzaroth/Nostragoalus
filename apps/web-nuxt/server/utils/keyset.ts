import { and, eq, lt, or, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

// Compound keyset cursor for a (createdAt desc, id desc) sort. Paging by the
// (createdAt, id) pair rather than createdAt alone keeps two rows that share a
// timestamp from being skipped or repeated when the page boundary falls between
// them (createdAt often defaults to the transaction-start time, so a whole batch
// minted in one tick shares it). Falls back to a createdAt-only bound when the
// caller has no id yet, and to no filter at all when there is no cursor.
export function keysetBefore(
  createdAt: AnyPgColumn,
  id: AnyPgColumn,
  before?: Date,
  beforeId?: string,
): SQL | undefined {
  if (!before) return undefined
  if (!beforeId) return lt(createdAt, before)
  return or(lt(createdAt, before), and(eq(createdAt, before), lt(id, beforeId)))
}
