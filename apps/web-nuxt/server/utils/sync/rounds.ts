import { and, eq, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { round } from '../../../db/schema'
import type { AppStage, NormalizedMatch } from '../../../shared/types/match'

const STAGE_ORDER: Record<AppStage, number> = {
  GROUP: 0,
  R32: 10,
  R16: 20,
  QF: 30,
  SF: 40,
  THIRD_PLACE: 50,
  FINAL: 60,
}

const KNOCKOUT_LABELS: Record<Exclude<AppStage, 'GROUP'>, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  THIRD_PLACE: 'Third-place play-off',
  FINAL: 'Final',
}

export interface RoundDef {
  kind: 'GROUP_MATCHDAY' | 'KNOCKOUT'
  stage: AppStage
  matchday: number | null
  label: string
  sortOrder: number
}

// Derive a round from a match's stage/matchday. Works for any competition format
// (e.g. the Euro starts at the Round of 16 with no Round of 32).
export function roundDefForMatch(stage: AppStage, matchday: number | null): RoundDef {
  if (stage === 'GROUP') {
    const md = matchday ?? 1
    return { kind: 'GROUP_MATCHDAY', stage, matchday: md, label: `Group Matchday ${md}`, sortOrder: md }
  }
  return { kind: 'KNOCKOUT', stage, matchday: null, label: KNOCKOUT_LABELS[stage], sortOrder: STAGE_ORDER[stage] }
}

export async function ensureRounds(
  db: AppDatabase,
  competitionId: string,
  matches: NormalizedMatch[],
): Promise<void> {
  const defs = new Map<string, RoundDef>()
  for (const m of matches) {
    const def = roundDefForMatch(m.stage, m.matchday)
    defs.set(`${def.stage}:${def.matchday ?? ''}`, def)
  }

  for (const def of defs.values()) {
    const where =
      def.matchday === null
        ? and(eq(round.competitionId, competitionId), eq(round.stage, def.stage), isNull(round.matchday))
        : and(eq(round.competitionId, competitionId), eq(round.stage, def.stage), eq(round.matchday, def.matchday))
    const existing = await db.select({ id: round.id }).from(round).where(where).limit(1)
    if (existing.length === 0) await db.insert(round).values({ competitionId, ...def })
  }
}

export async function findRoundId(
  db: AppDatabase,
  competitionId: string,
  stage: AppStage,
  matchday: number | null,
): Promise<string | null> {
  const key = stage === 'GROUP' ? matchday : null
  const where =
    key === null
      ? and(eq(round.competitionId, competitionId), eq(round.stage, stage), isNull(round.matchday))
      : and(eq(round.competitionId, competitionId), eq(round.stage, stage), eq(round.matchday, key))
  const rows = await db.select({ id: round.id }).from(round).where(where).limit(1)
  return rows.length ? rows[0].id : null
}

// A fixture reaches the match table only when the round ensureRounds() files it
// under is the one findRoundId() then looks for. They disagree in exactly one
// case: a GROUP fixture carrying no matchday is filed under matchday 1 but
// looked up as NULL, so upsertMatches() counts it in `skipped` and it never
// appears. Derived from both functions rather than restating the rule, so a
// change to either is reflected here. Used by the competition probe to tell an
// admin that up front, instead of leaving them with an empty competition.
export function isIngestible(stage: AppStage, matchday: number | null): boolean {
  const filedUnder = roundDefForMatch(stage, matchday).matchday
  const lookedUpAs = stage === 'GROUP' ? matchday : null
  return filedUnder === lookedUpAs
}
