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

// A GROUP round's sort order IS its matchday, and `round` is unique on
// (competition, sort_order), so the knockout ladder has to live above any
// matchday a competition can reach. Pools capped that at 5 (the largest pool the
// feeds carry is five teams, ten fixtures, two to a matchday); a single table
// does not - the Championship plays 46 rounds. Without the offset, matchday 10
// collides with R32 and the whole sync aborts on the unique index.
// drizzle/0066_knockout_sort_band.sql lifts the rounds already stored.
const KNOCKOUT_SORT_BASE = 1000

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
//
// `pooled` names the round after what the competition actually has: a Six
// Nations round is a round, not a "Group Matchday", and there is no group for it
// to be the matchday of.
export function roundDefForMatch(stage: AppStage, matchday: number | null, pooled = true): RoundDef {
  if (stage === 'GROUP') {
    const md = matchday ?? 1
    const label = pooled ? `Group Matchday ${md}` : `Round ${md}`
    return { kind: 'GROUP_MATCHDAY', stage, matchday: md, label, sortOrder: md }
  }
  return {
    kind: 'KNOCKOUT',
    stage,
    matchday: null,
    label: KNOCKOUT_LABELS[stage],
    sortOrder: KNOCKOUT_SORT_BASE + STAGE_ORDER[stage],
  }
}

export async function ensureRounds(
  db: AppDatabase,
  competitionId: string,
  matches: NormalizedMatch[],
): Promise<void> {
  // Same test the matchday derivation makes (see providers/stage.ts): any pool
  // letter anywhere means the competition has pools.
  const pooled = matches.some((m) => m.stage === 'GROUP' && m.group)
  const defs = new Map<string, RoundDef>()
  for (const m of matches) {
    const def = roundDefForMatch(m.stage, m.matchday, pooled)
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
