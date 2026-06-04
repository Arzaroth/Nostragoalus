import { and, eq, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { round } from '../../../db/schema'
import type { AppStage } from '../../../shared/types/match'

export interface RoundDef {
  kind: 'GROUP_MATCHDAY' | 'KNOCKOUT'
  stage: AppStage
  matchday: number | null
  label: string
  sortOrder: number
}

export const ROUND_DEFS: RoundDef[] = [
  { kind: 'GROUP_MATCHDAY', stage: 'GROUP', matchday: 1, label: 'Group Matchday 1', sortOrder: 1 },
  { kind: 'GROUP_MATCHDAY', stage: 'GROUP', matchday: 2, label: 'Group Matchday 2', sortOrder: 2 },
  { kind: 'GROUP_MATCHDAY', stage: 'GROUP', matchday: 3, label: 'Group Matchday 3', sortOrder: 3 },
  { kind: 'KNOCKOUT', stage: 'R32', matchday: null, label: 'Round of 32', sortOrder: 4 },
  { kind: 'KNOCKOUT', stage: 'R16', matchday: null, label: 'Round of 16', sortOrder: 5 },
  { kind: 'KNOCKOUT', stage: 'QF', matchday: null, label: 'Quarter-finals', sortOrder: 6 },
  { kind: 'KNOCKOUT', stage: 'SF', matchday: null, label: 'Semi-finals', sortOrder: 7 },
  { kind: 'KNOCKOUT', stage: 'THIRD_PLACE', matchday: null, label: 'Third-place play-off', sortOrder: 8 },
  { kind: 'KNOCKOUT', stage: 'FINAL', matchday: null, label: 'Final', sortOrder: 9 },
]

export async function ensureRounds(db: AppDatabase): Promise<void> {
  for (const def of ROUND_DEFS) {
    const where =
      def.matchday === null
        ? and(eq(round.stage, def.stage), isNull(round.matchday))
        : and(eq(round.stage, def.stage), eq(round.matchday, def.matchday))
    const existing = await db.select({ id: round.id }).from(round).where(where).limit(1)
    if (existing.length === 0) await db.insert(round).values(def)
  }
}

export async function findRoundId(
  db: AppDatabase,
  stage: AppStage,
  matchday: number | null,
): Promise<string | null> {
  const key = stage === 'GROUP' ? matchday : null
  const where =
    key === null
      ? and(eq(round.stage, stage), isNull(round.matchday))
      : and(eq(round.stage, stage), eq(round.matchday, key))
  const rows = await db.select({ id: round.id }).from(round).where(where).limit(1)
  return rows.length ? rows[0].id : null
}
