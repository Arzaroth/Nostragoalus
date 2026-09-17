import {
  WORLDRUGBY_BASE_URL,
  isScoringEvent,
  mapWorldRugbyTimelineKind,
  normalizeWorldRugbyMatch,
  worldRugbyMinute,
  type WrMatch,
  type WrTimelineEvent,
} from '../../../server/utils/providers/worldrugby'
import { CHECKS, RARE, REQUIRED, SAMPLED, type Plan, type Table } from '../ledger'
import { describeError, type CanaryContext, type CanarySource } from '../source'

const BASE = WORLDRUGBY_BASE_URL

// The feed's default sub-feed: men's fifteens.
const SPORT = 'mru'

// The newest started event can be a four-fixture tournament, which is too small
// a population to tell "this key is gone" from "nothing like that happened".
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
  // NOT required: the provider is built around untimed fixtures - `timed()`
  // drops them on purpose and normalizeWorldRugbyMatch returns an empty kickoff
  // rather than a fake one. A "date TBC" tie before a draw is routine, and
  // requiring this reds the source for a payload the app handles by design.
  ['time.millis', SAMPLED, CHECKS.epochMillis],
  ['time.label', SAMPLED, CHECKS.filledText],
  ['scores', SAMPLED, CHECKS.list],
  // Verified live: a round-robin event (Six Nations, Nations Championship,
  // Super Rugby) publishes null for all three on EVERY fixture. With a
  // three-event sample, a February morning can see nothing but round-robin.
  ['eventPhase', RARE, CHECKS.filledText],
  ['eventPhaseId.type', RARE, CHECKS.filledText],
  ['eventPhaseId.subType', RARE, CHECKS.filledText],
  ['venue.name', SAMPLED, CHECKS.filledText],
  // Published on a handful of fixtures a year and null on the rest.
  ['attendance', RARE, CHECKS.integer],
  ['description', SAMPLED, CHECKS.filledText],
  ['sport', SAMPLED, CHECKS.filledText],
  ['competition', SAMPLED, CHECKS.filledText],
]

const TEAM: Table = [
  ['id', REQUIRED, CHECKS.identifier],
  ['name', REQUIRED, CHECKS.filledText],
  ['abbreviation', SAMPLED, CHECKS.filledText],
  // Read only behind `abbreviation`, and the schedule route has not filled it
  // on any international event we sample - a dormant fallback.
  ['countryCode', RARE, CHECKS.filledText],
]

const TIMELINE: Table = [['timeline', REQUIRED, CHECKS.filledList]]

const TIMELINE_EVENT: Table = [
  ['type', REQUIRED, CHECKS.filledText],
  // `integer` accepts "1234", so the ledger alone cannot see secs becoming a
  // string; timelineCrossCheck() asserts the type the reader needs.
  ['time.secs', REQUIRED, CHECKS.integer],
  ['typeLabel', SAMPLED, CHECKS.filledText],
  ['teamIndex', SAMPLED, CHECKS.integer],
  ['playerId', SAMPLED, CHECKS.identifier],
  ['points', SAMPLED, CHECKS.integer],
  ['group', SAMPLED, CHECKS.filledText],
  // Both halves of a substitution carry it, and nothing else does.
  ['link', RARE, CHECKS.identifier],
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

export const WR_PLAN: Plan = [
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
  untimed: number
}

type Ledger = CanaryContext['ledger']

function inspectCatalog(payload: { content?: unknown[] | null }, ledger: Ledger): WrEventRow[] {
  ledger.check('catalog', payload, CATALOG)
  const events: WrEventRow[] = []
  for (const event of payload.content ?? []) {
    if (!event || typeof event !== 'object') {
      ledger.anomaly('an entry of the event catalog is not an object')
      continue
    }
    ledger.check('catalog.content[]', event, EVENT)
    events.push(event as WrEventRow)
  }
  return events
}

/**
 * The newest events of this sub-feed that have already started.
 *
 * An event with no `sport` at all is NOT treated as ours: `sport` is the only
 * thing separating men's fifteens from sevens, women's and age-grade, and
 * silently adopting an untagged event means probing the wrong competition
 * entirely while the key that would have said so is only SAMPLED.
 */
export function pickEvents(events: WrEventRow[], sport: string, now: Date, limit = MAX_EVENTS): WrEventRow[] {
  const started = (event: WrEventRow) => {
    const label = event.start?.label
    if (!label) return false
    const at = new Date(label).getTime()
    return Number.isFinite(at) && at <= now.getTime()
  }
  const mine = events.filter((e) => (e.sport ?? '').toLowerCase() === sport)
  const ours = mine.filter(started)
  return (ours.length ? ours : mine).slice(0, limit)
}

function inspectSchedule(payload: { matches?: unknown[] | null }, ledger: Ledger): Tally {
  const tally: Tally = { matches: 0, played: 0, timed: 0, untimed: 0 }
  ledger.check('schedule', payload, SCHEDULE)

  for (const match of payload.matches ?? []) {
    if (!match || typeof match !== 'object') {
      ledger.anomaly('an entry of the schedule is not an object')
      continue
    }
    tally.matches += 1
    ledger.check('match', match, MATCH)
    const row = match as unknown as WrMatch
    if (row.time?.millis) tally.timed += 1
    else tally.untimed += 1
    if ((row.scores ?? []).some((score) => Number(score) > 0)) tally.played += 1
    ledger.checkEach('match.teams[]', row.teams, TEAM, 'the teams of a fixture')
  }
  return tally
}

function crossCheck(matches: WrMatch[], tally: Tally, eventId: string): string[] {
  const problems: string[] = []
  let normalized
  try {
    normalized = matches.map((m) => normalizeWorldRugbyMatch(m, eventId))
  } catch (error) {
    return [`normalizeWorldRugbyMatch() threw ${describeError(error)}`]
  }

  // The provider drops every untimed fixture before anything downstream sees it,
  // so a whole competition losing its clocks ingests nothing at all - and it
  // does it in silence. Asked only when the feed HAD clocks to lose, because an
  // untimed fixture is a legitimate state, not a defect.
  const kept = normalized.filter((m) => m.kickoffTime)
  if (tally.timed && kept.length === 0) {
    problems.push(`${tally.timed} fixture(s) carry a clock and every one lost its kickoff time`)
  }
  if (tally.played && !normalized.some((m) => m.status === 'FINISHED')) {
    problems.push(`${tally.played} fixture(s) have points on the board and not one maps to FINISHED`)
  }
  if (normalized.length && !normalized.some((m) => m.homeTeam.name !== 'TBD' && m.awayTeam.name !== 'TBD')) {
    problems.push(`all ${normalized.length} fixtures resolved both sides to the TBD placeholder`)
  }
  return problems
}

function timelineCrossCheck(events: WrTimelineEvent[]): string[] {
  const problems: string[] = []
  if (!events.length) return problems

  // World Rugby sorts nothing by a flag: the kind of an action is read off
  // `type`/`group`, so a renamed vocabulary leaves every key in place and
  // renders an empty play-by-play.
  if (!events.some((e) => mapWorldRugbyTimelineKind(e) !== null)) {
    problems.push(`${events.length} timeline event(s) and not one maps to a known kind`)
  }
  const scoring = events.filter(isScoringEvent)
  if (events.some((e) => Number(e.points) > 0) && scoring.length === 0) {
    problems.push('events carry points and isScoringEvent() recognises none of them')
  }
  // worldRugbyMinute only refuses null and negatives, so asking it to parse
  // proves nothing. What can actually drift is secs arriving as a string, which
  // the ledger's `integer` check happily accepts.
  const untyped = events.filter((e) => e.time?.secs != null && typeof e.time.secs !== 'number')
  if (untyped.length) {
    problems.push(`${untyped.length} timeline clock(s) are not numbers, so the running order cannot be trusted`)
  }
  const usable = events.filter((e) => typeof e.time?.secs === 'number' && worldRugbyMinute(e.time.secs) !== null)
  if (!usable.length) problems.push(`none of the ${events.length} event clock(s) yields a readable minute`)
  return problems
}

export function worldRugbySource(sport: string = SPORT): CanarySource {
  return {
    name: 'worldrugby',
    plan: WR_PLAN,
    async visit(ctx: CanaryContext) {
      const { ledger } = ctx
      const problems: string[] = []

      const catalog = await ctx.getJson<{ content?: unknown[] | null }>(`${BASE}/event?page=0&pageSize=100&sort=desc`)
      const events = inspectCatalog(catalog, ledger)
      const candidates = pickEvents(events, sport, ctx.now)
      if (!candidates.length) {
        problems.push(`the event catalog carries no ${sport} event at all`)
        return problems
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
          `schedule    ${event.label ?? ref}: ${tally.matches} fixture(s), ${tally.timed} timed, ${tally.played} played`,
        )
        sample ??= matches.find((m) => (m.scores ?? []).some((s) => Number(s) > 0))
        if (fixtures.length >= ENOUGH_FIXTURES && sample) break
      }

      if (!sample) {
        ctx.note('timeline    no played fixture in these events: nothing to inspect')
        return problems
      }

      const timeline = await ctx.getJson<{ timeline?: unknown[] | null }>(
        `${BASE}/match/${encodeURIComponent(sample.matchId)}/timeline?language=en`,
      )
      ledger.check('timeline', timeline, TIMELINE)
      ledger.checkEach('timeline.timeline[]', timeline.timeline, TIMELINE_EVENT, 'the timeline')
      problems.push(...timelineCrossCheck((timeline.timeline ?? []) as WrTimelineEvent[]))
      ctx.note(`timeline    match ${sample.matchId}, ${(timeline.timeline ?? []).length} event(s)`)

      const summary = await ctx.getJson<{ teams?: unknown[] | null }>(
        `${BASE}/match/${encodeURIComponent(sample.matchId)}/summary`,
      )
      ledger.check('summary', summary, SUMMARY)
      let players = 0
      for (const team of summary.teams ?? []) {
        if (!team || typeof team !== 'object') {
          ledger.anomaly('an entry of summary.teams is not an object')
          continue
        }
        ledger.check('summary.teams[]', team, SUMMARY_TEAM)
        const list = (team as { teamList?: { list?: unknown } | null }).teamList?.list
        players += ledger.checkEach('summary.teams[].teamList.list[]', list, SUMMARY_PLAYER, 'the team sheet')
      }
      ctx.note(`summary     match ${sample.matchId}, ${players} player(s)`)

      return problems
    },
  }
}

export const wrInternals = { inspectCatalog, inspectSchedule, crossCheck, timelineCrossCheck, pickEvents }
