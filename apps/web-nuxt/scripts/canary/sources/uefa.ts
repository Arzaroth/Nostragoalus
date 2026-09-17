import {
  eventMinute,
  normalizeUefaLineups,
  normalizeUefaMatch,
  normalizeUefaTimeline,
  type UefaEvent,
  type UefaLineupsResponse,
  type UefaMatch,
} from '../../../server/utils/providers/uefa'
import { CHECKS, Ledger, nullable, RARE, REQUIRED, SAMPLED, type Plan, type Table } from '../ledger'
import { europeanSeasonYear, type CanaryContext, type CanarySource } from '../source'

const BASE = 'https://match.uefa.com'

// 3 is the Champions League: the one UEFA competition that is in play from
// September to May, so the window in which nothing can be verified is short.
const COMPETITION_ID = '3'
const PAGE = 200

// The feed's seasonYear does not always hold what the calendar says it should -
// a season can be published late, or under the year we would not have guessed.
// Walking back a few years is what keeps an August morning from reporting an
// empty competition as drift.
const SEASONS_BACK = 4

// Events are read from more than one match on purpose: an own goal or a VAR
// decision does not happen every night, and a population of one match would
// report half the vocabulary absent on most days.
const EVENT_SAMPLE = 3

const MATCH: Table = [
  ['id', REQUIRED, CHECKS.identifier],
  ['status', REQUIRED, CHECKS.filledText],
  ['kickOffTime.dateTime', REQUIRED, CHECKS.date],
  ['homeTeam', REQUIRED, nullable(CHECKS.object)],
  ['awayTeam', REQUIRED, nullable(CHECKS.object)],
  ['round.id', SAMPLED, CHECKS.identifier],
  ['round.metaData.name', SAMPLED, CHECKS.filledText],
  ['group.metaData.groupName', SAMPLED, CHECKS.filledText],
  ['matchday.name', SAMPLED, CHECKS.filledText],
  ['matchday.phase', SAMPLED, CHECKS.filledText],
  ['score.total.home', SAMPLED, CHECKS.integer],
  ['score.total.away', SAMPLED, CHECKS.integer],
  ['score.penalty.home', RARE, CHECKS.integer],
  ['winner.match.team.id', SAMPLED, CHECKS.identifier],
  ['matchAttendance', SAMPLED, CHECKS.integer],
  ['stadium.translations.name', SAMPLED, CHECKS.object],
]

const TEAM: Table = [
  ['id', REQUIRED, CHECKS.identifier],
  ['internationalName', REQUIRED, CHECKS.filledText],
  ['countryCode', SAMPLED, CHECKS.filledText],
  ['bigLogoUrl', SAMPLED, CHECKS.filledText],
]

const EVENT: Table = [
  ['type', REQUIRED, CHECKS.filledText],
  ['phase', SAMPLED, CHECKS.filledText],
  ['time.minute', SAMPLED, CHECKS.integer],
  // Added time, an own goal or a penalty, and a VAR decision's wording: real
  // keys whose context may simply not occur in the matches sampled today.
  ['time.injuryMinute', RARE, CHECKS.integer],
  ['subType', RARE, CHECKS.filledText],
  ['primaryActor', SAMPLED, CHECKS.object],
  ['primaryActor.type', SAMPLED, CHECKS.filledText],
  ['primaryActor.team.id', SAMPLED, CHECKS.identifier],
  ['primaryActor.person.id', SAMPLED, CHECKS.identifier],
  ['primaryActor.person.internationalName', SAMPLED, CHECKS.filledText],
  ['secondaryActor.person.internationalName', RARE, CHECKS.filledText],
  ['freeText', RARE, CHECKS.filledText],
]

const LINEUPS: Table = [
  ['homeTeam', REQUIRED, nullable(CHECKS.object)],
  ['awayTeam', REQUIRED, nullable(CHECKS.object)],
  ['lineupStatus', SAMPLED, CHECKS.filledText],
]

const LINEUP_TEAM: Table = [
  ['field', SAMPLED, CHECKS.filledList],
  ['bench', SAMPLED, CHECKS.filledList],
]

const LINEUP_ENTRY: Table = [
  ['player', REQUIRED, CHECKS.object],
  ['player.id', SAMPLED, CHECKS.identifier],
  ['player.internationalName', SAMPLED, CHECKS.filledText],
  ['player.fieldPosition', SAMPLED, CHECKS.filledText],
  ['jerseyNumber', SAMPLED, CHECKS.identifier],
  ['fieldCoordinate.x', RARE, CHECKS.integer],
  ['fieldCoordinate.y', RARE, CHECKS.integer],
]

const PLAN: Plan = [
  ['payload', [['matches', REQUIRED, CHECKS.list]]],
  ['match', MATCH],
  ['match.homeTeam', TEAM],
  ['events', [['payload', REQUIRED, CHECKS.filledList]]],
  ['events[]', EVENT],
  ['lineups', LINEUPS],
  ['lineups.homeTeam', LINEUP_TEAM],
  ['lineups.homeTeam.field[]', LINEUP_ENTRY],
]

interface Tally {
  matches: number
  played: number
  withGroup: number
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function inspectMatches(matches: UefaMatch[], ledger: Ledger): Tally {
  const tally: Tally = { matches: 0, played: 0, withGroup: 0 }
  // The feed answers with a bare array, so the payload itself is the observation
  // rather than a key on it. `list` and not `filledList`: an empty season is a
  // quiet season, and only every probed season coming back empty is a finding -
  // which visit() raises as a cross-check.
  ledger.observe('payload.matches', REQUIRED, CHECKS.list, true, matches)

  for (const match of matches) {
    if (!isObject(match)) {
      ledger.anomaly('an entry of the matches array is not an object')
      continue
    }
    tally.matches += 1
    ledger.check('match', match, MATCH)
    if (match.group?.metaData?.groupName) tally.withGroup += 1
    if (match.score?.total?.home != null) tally.played += 1
    for (const side of [match.homeTeam, match.awayTeam]) {
      if (isObject(side)) ledger.check('match.homeTeam', side, TEAM)
    }
  }
  return tally
}

function crossCheck(matches: UefaMatch[], tally: Tally): string[] {
  const problems: string[] = []
  let normalized
  try {
    normalized = matches.map(normalizeUefaMatch)
  } catch (error) {
    return [`normalizeUefaMatch() threw ${error instanceof Error ? error.message : String(error)}`]
  }

  if (normalized.length !== tally.matches) {
    problems.push(`normalizeUefaMatch() yields ${normalized.length} match(es) for ${tally.matches} in the response`)
  }
  if (tally.played && !normalized.some((m) => m.status === 'FINISHED')) {
    problems.push(`${tally.played} match(es) carry a total score and not one maps to FINISHED`)
  }
  if (tally.withGroup && !normalized.some((m) => m.group !== null)) {
    problems.push(`${tally.withGroup} match(es) carry a groupName and not one yields a group letter`)
  }
  if (normalized.length && !normalized.some((m) => m.homeTeam.name && m.awayTeam.name)) {
    problems.push('no match carries the name of both its teams')
  }
  return problems
}

function inspectEvents(events: unknown[], ledger: Ledger): number {
  ledger.observe('events.payload', REQUIRED, CHECKS.filledList, true, events)
  let seen = 0
  for (const event of events) {
    if (!isObject(event)) {
      ledger.anomaly('an entry of the events array is not an object')
      continue
    }
    seen += 1
    ledger.check('events[]', event, EVENT)
  }
  return seen
}

function eventsCrossCheck(events: UefaEvent[], home: string | null, away: string | null): string[] {
  const problems: string[] = []
  let rows
  try {
    rows = normalizeUefaTimeline(events, home, away)
  } catch (error) {
    return [`normalizeUefaTimeline() threw ${error instanceof Error ? error.message : String(error)}`]
  }
  if (events.length && rows.length === 0) {
    problems.push(`${events.length} event(s) on a played match and normalizeUefaTimeline() recognised none`)
  }
  // The minute is not decoration: it orders the play-by-play and feeds the
  // added-time analytics. A key that stays put while its shape changes is the
  // drift that hides best.
  const timed = events.filter((e) => e.time?.minute != null)
  if (timed.length && !timed.some((e) => eventMinute(e) !== null)) {
    problems.push(`none of the ${timed.length} timed event(s) yields a readable minute`)
  }
  return problems
}

export function uefaSource(competitionId: string = COMPETITION_ID): CanarySource {
  return {
    name: 'uefa',
    async visit(ctx: CanaryContext) {
      const ledger = new Ledger(PLAN)
      const problems: string[] = []
      const newest = europeanSeasonYear(ctx.now)
      let list: UefaMatch[] = []
      let seasonYear = newest
      const probed: number[] = []

      for (let back = 0; back < SEASONS_BACK; back++) {
        seasonYear = newest - back
        probed.push(seasonYear)
        const matches = await ctx.getJson<UefaMatch[]>(
          `${BASE}/v5/matches?competitionId=${competitionId}&seasonYear=${seasonYear}&limit=${PAGE}&offset=0`,
        )
        list = Array.isArray(matches) ? matches : []
        if (list.length) break
      }

      const tally = inspectMatches(list, ledger)
      problems.push(...crossCheck(list, tally))
      if (!list.length) {
        problems.push(`competition ${competitionId} returned no fixture for any of the seasons ${probed.join(', ')}`)
      }
      ctx.note(
        `matches     competition ${competitionId}, season ${seasonYear}: ${tally.matches} match(es), ${tally.played} played, ${tally.withGroup} in a group`,
      )

      const played = list.filter((m) => m.score?.total?.home != null)
      // Spread across the season rather than the first three in a row: a single
      // matchday can be atypical, and consecutive fixtures share its weather.
      const step = Math.max(1, Math.floor(played.length / EVENT_SAMPLE))
      const sampled = Array.from({ length: Math.min(EVENT_SAMPLE, played.length) }, (_, i) => played[i * step]).filter(
        (m): m is UefaMatch => !!m,
      )

      if (!sampled.length) {
        ctx.note('events      no played match this season: nothing to inspect')
      } else {
        let seen = 0
        for (const match of sampled) {
          const events = await ctx.getJson<UefaEvent[]>(
            `${BASE}/v5/matches/${encodeURIComponent(match.id)}/events?filter=ALL&limit=500&offset=0`,
          )
          const rows = Array.isArray(events) ? events : []
          seen += inspectEvents(rows, ledger)
          problems.push(...eventsCrossCheck(rows, match.homeTeam?.id ?? null, match.awayTeam?.id ?? null))
        }
        ctx.note(`events      ${sampled.length} match(es) sampled, ${seen} event(s)`)

        const first = sampled[0]!
        const lineups = await ctx.getJson<UefaLineupsResponse>(
          `${BASE}/v5/matches/${encodeURIComponent(first.id)}/lineups`,
        )
        problems.push(...inspectLineups(lineups, ledger, ctx))
      }

      return { ledger, problems }
    },
  }
}

function inspectLineups(resp: UefaLineupsResponse, ledger: Ledger, ctx: CanaryContext): string[] {
  ledger.check('lineups', resp, LINEUPS)
  let entries = 0
  for (const team of [resp.homeTeam, resp.awayTeam]) {
    if (!isObject(team)) continue
    ledger.check('lineups.homeTeam', team, LINEUP_TEAM)
    for (const key of ['field', 'bench'] as const) {
      for (const entry of ((team as Record<string, unknown>)[key] as unknown[]) ?? []) {
        if (!isObject(entry)) continue
        entries += 1
        ledger.check('lineups.homeTeam.field[]', entry, LINEUP_ENTRY)
      }
    }
  }
  ctx.note(`lineups     ${entries} entr(ies)`)

  const problems: string[] = []
  try {
    const normalized = normalizeUefaLineups(resp)
    if (entries && !normalized.available) {
      problems.push(`${entries} lineup entr(ies) in the response and normalizeUefaLineups() reports none available`)
    }
  } catch (error) {
    problems.push(`normalizeUefaLineups() threw ${error instanceof Error ? error.message : String(error)}`)
  }
  return problems
}

export const uefaInternals = { inspectMatches, crossCheck, inspectEvents, eventsCrossCheck, inspectLineups, PLAN }
