import {
  isScoringEvent,
  mapWorldRugbyTimelineKind,
  normalizeWorldRugbyMatch,
  worldRugbyMinute,
  type WrMatch,
  type WrTimelineEvent,
} from '../../../server/utils/providers/worldrugby'
import { CHECKS, Ledger, RARE, REQUIRED, SAMPLED, type Plan, type Table } from '../ledger'
import type { CanaryContext, CanarySource } from '../source'

const BASE = 'https://api.wr-rims-prod.pulselive.com/rugby/v3'

// The feed's default sub-feed: men's fifteens.
const SPORT = 'mru'

// The newest started event can be a four-fixture tournament, which is too small
// a population to tell "this key is gone" from "nothing like that happened".
// Events are added until there are enough fixtures to draw a conclusion from.
const ENOUGH_FIXTURES = 20
const MAX_EVENTS = 3

const CATALOG: Table = [
  ['content', REQUIRED, CHECKS.filledList],
  ['pageInfo.numPages', SAMPLED, CHECKS.integer],
]

const EVENT: Table = [
  ['id', REQUIRED, CHECKS.identifier],
  // The uuid the /event routes now require. Its disappearance would send every
  // rugby competition back to the legacy numeric id, which answers 400.
  ['altId', SAMPLED, CHECKS.filledText],
  ['label', SAMPLED, CHECKS.filledText],
  ['sport', SAMPLED, CHECKS.filledText],
  ['start.label', SAMPLED, CHECKS.filledText],
  ['end.label', SAMPLED, CHECKS.filledText],
]

const SCHEDULE: Table = [['matches', REQUIRED, CHECKS.filledList]]

const MATCH: Table = [
  ['matchId', REQUIRED, CHECKS.identifier],
  ['status', REQUIRED, CHECKS.filledText],
  ['teams', REQUIRED, CHECKS.filledList],
  // Everything without a clock is dropped on the floor by the provider's own
  // `timed` filter, so this key going missing empties a whole competition in
  // silence.
  ['time.millis', REQUIRED, CHECKS.epochMillis],
  ['time.label', SAMPLED, CHECKS.filledText],
  ['scores', SAMPLED, CHECKS.list],
  ['eventPhase', SAMPLED, CHECKS.filledText],
  ['eventPhaseId.type', SAMPLED, CHECKS.filledText],
  ['eventPhaseId.subType', SAMPLED, CHECKS.filledText],
  ['venue.name', SAMPLED, CHECKS.filledText],
  // Published on a handful of fixtures a year and null on the rest, so its
  // absence on a given day says nothing.
  ['attendance', RARE, CHECKS.integer],
  ['description', SAMPLED, CHECKS.filledText],
  ['sport', SAMPLED, CHECKS.filledText],
  ['competition', SAMPLED, CHECKS.filledText],
]

const TEAM: Table = [
  ['id', REQUIRED, CHECKS.identifier],
  ['name', REQUIRED, CHECKS.filledText],
  ['abbreviation', SAMPLED, CHECKS.filledText],
  // Read only behind `abbreviation` (worldrugby.ts toTeam), and the schedule
  // route has not filled it on any international event we sample - a dormant
  // fallback, watched for a type change rather than for presence.
  ['countryCode', RARE, CHECKS.filledText],
]

const TIMELINE: Table = [['timeline', REQUIRED, CHECKS.filledList]]

const TIMELINE_EVENT: Table = [
  ['type', REQUIRED, CHECKS.filledText],
  ['time.secs', REQUIRED, CHECKS.integer],
  ['typeLabel', SAMPLED, CHECKS.filledText],
  ['teamIndex', SAMPLED, CHECKS.integer],
  ['playerId', SAMPLED, CHECKS.identifier],
  ['points', SAMPLED, CHECKS.integer],
  ['group', SAMPLED, CHECKS.filledText],
  ['link', SAMPLED, CHECKS.identifier],
]

const SUMMARY: Table = [['teams', REQUIRED, CHECKS.filledList]]

const SUMMARY_TEAM: Table = [
  ['teamList.list', SAMPLED, CHECKS.filledList],
  ['teamList.captainIds', SAMPLED, CHECKS.list],
]

const SUMMARY_PLAYER: Table = [
  ['player.name.display', REQUIRED, CHECKS.filledText],
  ['player.id', SAMPLED, CHECKS.identifier],
  ['player.altId', SAMPLED, CHECKS.identifier],
  ['number', SAMPLED, CHECKS.identifier],
]

const PLAN: Plan = [
  ['catalog', CATALOG],
  ['catalog.content[]', EVENT],
  ['schedule', SCHEDULE],
  ['match', MATCH],
  ['match.teams[]', TEAM],
  ['timeline', TIMELINE],
  ['timeline.timeline[]', TIMELINE_EVENT],
  ['summary', SUMMARY],
  ['summary.teams[]', SUMMARY_TEAM],
  ['summary.teams[].teamList.list[]', SUMMARY_PLAYER],
]

interface WrEventRow {
  id?: string | number | null
  altId?: string | null
  label?: string | null
  sport?: string | null
  start?: { label?: string | null } | null
}

interface Tally {
  matches: number
  played: number
  timed: number
  withPhase: number
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function inspectCatalog(payload: { content?: unknown[] | null }, ledger: Ledger): WrEventRow[] {
  ledger.check('catalog', payload, CATALOG)
  const events: WrEventRow[] = []
  for (const event of payload.content ?? []) {
    if (!isObject(event)) {
      ledger.anomaly('an entry of the event catalog is not an object')
      continue
    }
    ledger.check('catalog.content[]', event, EVENT)
    events.push(event as WrEventRow)
  }
  return events
}

/**
 * The newest events of this sub-feed that have already started. Newest-first is
 * how the catalog is sorted, but the very newest is often still in the future,
 * and an event with no played match verifies none of the interesting keys.
 */
export function pickEvents(events: WrEventRow[], sport: string, now: Date, limit = MAX_EVENTS): WrEventRow[] {
  const started = (event: WrEventRow) => {
    const label = event.start?.label
    if (!label) return false
    const at = new Date(label).getTime()
    return Number.isFinite(at) && at <= now.getTime()
  }
  const mine = events.filter((e) => !e.sport || e.sport.toLowerCase() === sport)
  const ours = mine.filter(started)
  return (ours.length ? ours : mine).slice(0, limit)
}

function inspectSchedule(payload: { matches?: unknown[] | null }, ledger: Ledger): Tally {
  const tally: Tally = { matches: 0, played: 0, timed: 0, withPhase: 0 }
  ledger.check('schedule', payload, SCHEDULE)

  for (const match of payload.matches ?? []) {
    if (!isObject(match)) {
      ledger.anomaly('an entry of the schedule is not an object')
      continue
    }
    tally.matches += 1
    ledger.check('match', match, MATCH)
    const row = match as unknown as WrMatch
    if (row.time?.millis) tally.timed += 1
    if (row.eventPhase || row.eventPhaseId?.type) tally.withPhase += 1
    if ((row.scores ?? []).some((score) => Number(score) > 0)) tally.played += 1
    for (const team of row.teams ?? []) {
      if (isObject(team)) ledger.check('match.teams[]', team, TEAM)
    }
  }
  return tally
}

function crossCheck(matches: WrMatch[], tally: Tally, eventId: string): string[] {
  const problems: string[] = []
  let normalized
  try {
    normalized = matches.map((m) => normalizeWorldRugbyMatch(m, eventId))
  } catch (error) {
    return [`normalizeWorldRugbyMatch() threw ${error instanceof Error ? error.message : String(error)}`]
  }

  // The provider drops every untimed fixture before anything downstream sees it.
  // All of them dropping at once is a competition that silently ingests nothing,
  // and it is exactly the failure a mocked test cannot reach.
  const kept = normalized.filter((m) => m.kickoffTime)
  if (tally.matches && kept.length === 0) {
    problems.push(`${tally.matches} fixture(s) in the schedule and every one lost its kickoff time`)
  }
  if (tally.timed && kept.length < tally.timed) {
    problems.push(`${tally.timed} fixture(s) carry a clock but only ${kept.length} kept a kickoff time`)
  }
  if (tally.played && !normalized.some((m) => m.status === 'FINISHED')) {
    problems.push(`${tally.played} fixture(s) have points on the board and not one maps to FINISHED`)
  }
  if (tally.withPhase && normalized.length > 8 && normalized.every((m) => m.stage === normalized[0]?.stage)) {
    problems.push(`all ${normalized.length} fixtures collapsed onto stage ${normalized[0]?.stage}`)
  }
  if (normalized.length && !normalized.some((m) => m.homeTeam.name && m.awayTeam.name)) {
    problems.push('no fixture carries the name of both its teams')
  }
  return problems
}

function timelineCrossCheck(events: WrTimelineEvent[]): string[] {
  const problems: string[] = []
  if (!events.length) return problems

  // World Rugby sorts nothing by a flag: the kind of an action is read off
  // `type`, so a renamed vocabulary leaves every key in place and renders an
  // empty play-by-play.
  if (!events.some((e) => mapWorldRugbyTimelineKind(e) !== null)) {
    problems.push(`${events.length} timeline event(s) and not one maps to a known kind`)
  }
  const scoring = events.filter(isScoringEvent)
  if (events.some((e) => Number(e.points) > 0) && scoring.length === 0) {
    problems.push('events carry points and isScoringEvent() recognises none of them')
  }
  const clocks = events.map((e) => e.time?.secs).filter((s): s is number => typeof s === 'number')
  if (clocks.length && !clocks.some((s) => worldRugbyMinute(s) !== null)) {
    problems.push(`none of the ${clocks.length} event clock(s) yields a readable minute`)
  }
  return problems
}

export function worldRugbySource(sport: string = SPORT): CanarySource {
  return {
    name: 'worldrugby',
    async visit(ctx: CanaryContext) {
      const ledger = new Ledger(PLAN)
      const problems: string[] = []

      const catalog = await ctx.getJson<{ content?: unknown[] | null }>(`${BASE}/event?page=0&pageSize=100&sort=desc`)
      const events = inspectCatalog(catalog, ledger)
      const candidates = pickEvents(events, sport, ctx.now)
      if (!candidates.length) {
        problems.push(`the event catalog carries no ${sport} event at all`)
        return { ledger, problems }
      }
      ctx.note(`catalog     ${events.length} event(s), ${candidates.length} candidate(s)`)

      const fixtures: WrMatch[] = []
      let sample: WrMatch | undefined
      for (const event of candidates) {
        const ref = event.altId ? String(event.altId) : String(event.id ?? '')
        const schedule = await ctx.getJson<{ matches?: unknown[] | null }>(
          `${BASE}/event/${encodeURIComponent(ref)}/schedule?language=en`,
        )
        const tally = inspectSchedule(schedule, ledger)
        const matches = (schedule.matches ?? []) as WrMatch[]
        problems.push(...crossCheck(matches, tally, ref))
        fixtures.push(...matches)
        ctx.note(
          `schedule    ${event.label ?? ref}: ${tally.matches} fixture(s), ${tally.timed} timed, ${tally.played} played, ${tally.withPhase} with a phase`,
        )
        sample ??= matches.find((m) => (m.scores ?? []).some((s) => Number(s) > 0))
        if (fixtures.length >= ENOUGH_FIXTURES && sample) break
      }

      if (!sample) {
        ctx.note('timeline    no played fixture in these events: nothing to inspect')
        return { ledger, problems }
      }

      const timeline = await ctx.getJson<{ timeline?: unknown[] | null }>(
        `${BASE}/match/${encodeURIComponent(sample.matchId)}/timeline?language=en`,
      )
      ledger.check('timeline', timeline, TIMELINE)
      for (const entry of timeline.timeline ?? []) {
        if (!isObject(entry)) {
          ledger.anomaly('an entry of the timeline is not an object')
          continue
        }
        ledger.check('timeline.timeline[]', entry, TIMELINE_EVENT)
      }
      problems.push(...timelineCrossCheck((timeline.timeline ?? []) as WrTimelineEvent[]))
      ctx.note(`timeline    match ${sample.matchId}, ${(timeline.timeline ?? []).length} event(s)`)

      const summary = await ctx.getJson<{ teams?: unknown[] | null }>(
        `${BASE}/match/${encodeURIComponent(sample.matchId)}/summary`,
      )
      ledger.check('summary', summary, SUMMARY)
      let players = 0
      for (const team of summary.teams ?? []) {
        if (!isObject(team)) continue
        ledger.check('summary.teams[]', team, SUMMARY_TEAM)
        const list = ((team.teamList as { list?: unknown[] } | null)?.list ?? []) as unknown[]
        for (const entry of list) {
          if (!isObject(entry)) continue
          players += 1
          ledger.check('summary.teams[].teamList.list[]', entry, SUMMARY_PLAYER)
        }
      }
      ctx.note(`summary     match ${sample.matchId}, ${players} player(s)`)

      return { ledger, problems }
    },
  }
}

export const wrInternals = { inspectCatalog, inspectSchedule, crossCheck, timelineCrossCheck, pickEvents, PLAN }
