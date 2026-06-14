import { and, desc, eq, min } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, round } from '../../../db/schema'

export interface SecondChanceWindow {
  start: Date | null
  end: Date | null
}

// The re-pick window for champion / best-scorer picks: it opens when the last
// group round kicks off and closes when the knockouts begin. Defined on
// round_kind so it adapts to any competition shaped group-stage -> bracket
// (football MD3 -> R16, and, once mapped the same way, esports Swiss -> playoffs).
// A competition with no group rounds or no knockout rounds has no window.
export async function getSecondChanceWindow(db: AppDatabase, competitionId: string): Promise<SecondChanceWindow> {
  const lastGroup = await db
    .select({ id: round.id })
    .from(round)
    .where(and(eq(round.competitionId, competitionId), eq(round.kind, 'GROUP_MATCHDAY')))
    .orderBy(desc(round.sortOrder))
    .limit(1)

  let start: Date | null = null
  if (lastGroup[0]) {
    const rows = await db.select({ k: min(match.kickoffTime) }).from(match).where(eq(match.roundId, lastGroup[0].id))
    start = rows[0]?.k == null ? null : new Date(rows[0].k as string | Date)
  }

  const ko = await db
    .select({ k: min(match.kickoffTime) })
    .from(match)
    .innerJoin(round, eq(round.id, match.roundId))
    .where(and(eq(round.competitionId, competitionId), eq(round.kind, 'KNOCKOUT')))
  const end = ko[0]?.k == null ? null : new Date(ko[0].k as string | Date)

  // start and end come from independent queries; bad fixture data (a knockout
  // placeholder kicking off before the last group round) can invert them, which
  // would silently keep the window shut. Surface it instead of failing quietly.
  if (start && end && end <= start) {
    console.warn(
      `[second-chance] inverted window for competition ${competitionId}: start ${start.toISOString()} >= end ${end.toISOString()} - re-pick will never open; check fixture kickoff times.`,
    )
  }

  return { start, end }
}

export function isSecondChanceOpen(window: SecondChanceWindow, now: Date = new Date()): boolean {
  return window.start != null && window.end != null && now >= window.start && now < window.end
}
