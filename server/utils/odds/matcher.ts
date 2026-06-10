import type { OddsEvent } from './types'

// Bookmaker-side names diverge from FIFA/UEFA fixture names ("South Korea" vs
// "Korea Republic"). Codes don't exist on the odds side, so matching works on
// normalized names + a small alias map + a kickoff window.
export function normalizeTeamName(name: string): string {
  const folded = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return folded.startsWith('the ') ? folded.slice(4) : folded
}

// normalized bookmaker name -> normalized fixture name. Extend from the
// unmatched-event names the sync task logs.
export const TEAM_NAME_ALIASES: Record<string, string> = {
  'south korea': 'korea republic',
  'north korea': 'korea dpr',
  'iran': 'ir iran',
  'united states': 'usa',
  'ivory coast': 'cote d ivoire',
  'turkey': 'turkiye',
  'cape verde': 'cabo verde',
  'dr congo': 'congo dr',
  'democratic republic of the congo': 'congo dr',
  'uae': 'united arab emirates',
  'czech republic': 'czechia',
  'bosnia': 'bosnia and herzegovina',
  // Sofascore writes "Bosnia & Herzegovina"; the ampersand normalizes away.
  'bosnia herzegovina': 'bosnia and herzegovina',
}

export function canonicalTeamName(name: string): string {
  const normalized = normalizeTeamName(name)
  return TEAM_NAME_ALIASES[normalized] ?? normalized
}

export interface OddsFixture {
  id: string
  homeTeam: string
  awayTeam: string
  kickoffTime: Date
}

export interface EventMatch {
  fixture: OddsFixture
  event: OddsEvent
  // The provider lists our away side as its home side: odds must be flipped.
  swapped: boolean
}

export interface MatchEventsResult {
  matched: EventMatch[]
  unmatched: OddsEvent[]
  ambiguous: OddsEvent[]
}

// ±6h absorbs TBD-kickoff drift while staying inside one matchday, where the
// same pairing can't repeat.
const DEFAULT_WINDOW_MS = 6 * 60 * 60 * 1000

export function matchEventsToFixtures(
  events: OddsEvent[],
  fixtures: OddsFixture[],
  opts?: { windowMs?: number },
): MatchEventsResult {
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS
  const canon = fixtures.map((f) => ({
    fixture: f,
    home: canonicalTeamName(f.homeTeam),
    away: canonicalTeamName(f.awayTeam),
  }))

  const unmatched: OddsEvent[] = []
  const ambiguous: OddsEvent[] = []
  const candidates: { event: OddsEvent; match: EventMatch }[] = []

  for (const event of events) {
    const eventHome = canonicalTeamName(event.homeName)
    const eventAway = canonicalTeamName(event.awayName)
    const hits = canon.filter(
      (c) =>
        Math.abs(c.fixture.kickoffTime.getTime() - event.kickoff.getTime()) <= windowMs &&
        ((c.home === eventHome && c.away === eventAway) || (c.home === eventAway && c.away === eventHome)),
    )
    if (hits.length === 0) {
      unmatched.push(event)
    } else if (hits.length > 1) {
      ambiguous.push(event)
    } else {
      candidates.push({ event, match: { fixture: hits[0].fixture, event, swapped: hits[0].home !== eventHome } })
    }
  }

  // Two events claiming the same fixture means a duplicate feed entry - never
  // guess which is right, drop them all.
  const claims = new Map<string, number>()
  for (const c of candidates) claims.set(c.match.fixture.id, (claims.get(c.match.fixture.id) ?? 0) + 1)

  const matched: EventMatch[] = []
  for (const c of candidates) {
    if (claims.get(c.match.fixture.id)! > 1) ambiguous.push(c.event)
    else matched.push(c.match)
  }

  return { matched, unmatched, ambiguous }
}
