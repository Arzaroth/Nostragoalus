import type {
  BookingEvent,
  MatchDetail,
  MatchLineups,
  NormalizedGoal,
  PeriodKind,
  SquadPlayer,
  SubstitutionEvent,
  TeamLineup,
  TeamMatchStats,
  TimelineEvent,
  TimelineEventKind,
} from '../../../shared/types/match'

// Parsers for ESPN's per-match document:
//   …/site/v2/sports/soccer/{league}/summary?event={id}
// One request carries the play-by-play, both line-ups and both teams' stats, so
// every per-match method in the adapter reads this same document.

export interface EspnSummaryAthlete {
  id?: string | number | null
  displayName?: string | null
  shortName?: string | null
  headshot?: { href?: string | null } | null
}

export interface EspnKeyEvent {
  type?: { id?: string | number | null; text?: string | null } | null
  text?: string | null
  clock?: { displayValue?: string | null } | null
  period?: { number?: number | null } | null
  team?: { id?: string | number | null } | null
  participants?: { athlete?: EspnSummaryAthlete | null }[] | null
  scoringPlay?: boolean | null
  shootout?: boolean | null
}

export interface EspnRosterEntry {
  starter?: boolean | null
  jersey?: string | null
  subbedIn?: boolean | null
  subbedOut?: boolean | null
  position?: { abbreviation?: string | null } | null
  athlete?: EspnSummaryAthlete | null
}

export interface EspnRoster {
  homeAway?: string | null
  formation?: string | null
  team?: { id?: string | number | null; displayName?: string | null; abbreviation?: string | null } | null
  roster?: EspnRosterEntry[] | null
  coach?: { firstName?: string | null; lastName?: string | null }[] | null
}

export interface EspnBoxscoreTeam {
  team?: { id?: string | number | null } | null
  statistics?: { name?: string | null; displayValue?: string | null; value?: number | null }[] | null
}

export interface EspnSummary {
  keyEvents?: EspnKeyEvent[] | null
  rosters?: EspnRoster[] | null
  boxscore?: { teams?: EspnBoxscoreTeam[] | null } | null
  gameInfo?: { venue?: { fullName?: string | null } | null; attendance?: number | null } | null
  header?: {
    competitions?: {
      competitors?: { homeAway?: string | null; team?: { id?: string | number | null } | null }[] | null
      status?: { displayClock?: string | null; type?: { name?: string | null } | null } | null
    }[]
    | null
  } | null
}

function id(value: string | number | null | undefined): string | null {
  return value == null || value === '' ? null : String(value)
}

function num(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// ESPN's event type ids. The goal variants exist because the feed names the
// finish ("Goal - Header", "Goal - Volley"); they are all just goals to us.
const OWN_GOAL = '97'
const PENALTY_SCORED = '98'
const YELLOW_CARD = '94'
const RED_CARD = '93'
const SECOND_YELLOW = '95'
const SUBSTITUTION = '76'
const PENALTY_MISSED = '99'

// Period markers. 85 (half-time of extra time) and 86 (start of its second half)
// are dropped: the app has no kind for them and they only clutter the timeline.
const PERIOD_KINDS: Record<string, PeriodKind> = {
  '80': 'kickoff',
  '81': 'half-time',
  '82': 'second-half',
  '83': 'second-half-end',
  '84': 'extra-time',
  '87': 'extra-time-end',
}

// Noise: a delay is opened and closed around every VAR check and injury, ~500
// entries in a single match document, and none of it is worth a timeline row.
const IGNORED_TYPES = new Set(['129', '130', '85', '86'])

export function espnEventTypeId(event: EspnKeyEvent): string {
  return id(event.type?.id) ?? ''
}

function isGoal(event: EspnKeyEvent): boolean {
  return Boolean(event.scoringPlay) && !event.shootout
}

export function espnEventKind(event: EspnKeyEvent): TimelineEventKind | null {
  const type = espnEventTypeId(event)
  if (IGNORED_TYPES.has(type)) return null
  if (event.shootout) return null

  if (type === OWN_GOAL) return 'own-goal'
  if (type === PENALTY_SCORED) return 'penalty-goal'
  if (type === PENALTY_MISSED) return 'penalty-missed'
  if (isGoal(event)) return 'goal'
  if (type === YELLOW_CARD) return 'yellow'
  if (type === SECOND_YELLOW) return 'second-yellow'
  if (type === RED_CARD) return 'red'
  if (type === SUBSTITUTION) return 'sub'
  if (PERIOD_KINDS[type]) return 'period'
  // The feed spells every review as "VAR - <decision>"; the decision itself only
  // exists as free text, so this is the one kind we cannot phrase ourselves.
  if (/^var\b/i.test(event.type?.text ?? '')) return 'var'
  return null
}

function actorNames(event: EspnKeyEvent): { main: string | null; second: string | null } {
  const names = (event.participants ?? []).map((p) => p.athlete?.displayName ?? null).filter((n): n is string => !!n)
  return { main: names[0] ?? null, second: names[1] ?? null }
}

export interface EspnTimelineOptions {
  homeTeamId?: string | null
  awayTeamId?: string | null
}

export function parseEspnTimeline(summary: EspnSummary, opts: EspnTimelineOptions = {}): TimelineEvent[] {
  const homeId = id(opts.homeTeamId)
  const awayId = id(opts.awayTeamId)
  const events = summary.keyEvents ?? []

  // A match that reached extra time ends at "End Extra Time"; one that did not
  // ends at "End Regular Time", which is that match's full-time whistle.
  const wentToExtraTime = events.some((e) => espnEventTypeId(e) === '84')

  let home = 0
  let away = 0
  const out: TimelineEvent[] = []

  for (const event of events) {
    const kind = espnEventKind(event)
    if (!kind) continue

    const teamId = id(event.team?.id)
    const side = teamId != null && homeId != null && teamId === homeId ? 'HOME' : teamId != null && awayId != null && teamId === awayId ? 'AWAY' : null

    if (kind === 'goal' || kind === 'own-goal' || kind === 'penalty-goal') {
      if (side === 'HOME') home += 1
      else if (side === 'AWAY') away += 1
    }

    const { main, second } = actorNames(event)
    let periodKind: PeriodKind | null = null
    if (kind === 'period') {
      const type = espnEventTypeId(event)
      periodKind = type === '83' && !wentToExtraTime ? 'full-time' : PERIOD_KINDS[type]
    }

    out.push({
      kind,
      side: kind === 'period' ? null : side,
      minute: event.clock?.displayValue || null,
      // A substitution names the player coming on first, then the one going off.
      playerName: kind === 'sub' ? null : main,
      playerInName: kind === 'sub' ? main : null,
      playerOutName: kind === 'sub' ? second : null,
      periodKind,
      text: kind === 'var' ? (event.text ?? null) : null,
      homeScore: home,
      awayScore: away,
    })
  }

  return out
}

export function parseEspnGoals(
  summary: EspnSummary,
  teams: { homeId: string | null; awayId: string | null; homeName: string; homeCode: string | null; awayName: string; awayCode: string | null },
): NormalizedGoal[] {
  const goals: NormalizedGoal[] = []
  for (const event of summary.keyEvents ?? []) {
    const kind = espnEventKind(event)
    if (kind !== 'goal' && kind !== 'own-goal' && kind !== 'penalty-goal') continue

    const teamId = id(event.team?.id)
    // An own goal sits under the team it benefits while the scorer is on the
    // other roster, which is the same convention FIFA uses. A goal we cannot
    // attribute to either side is dropped rather than guessed onto one: this
    // feeds the scoreline and the scorer aggregation.
    const side = teamId != null && teamId === teams.homeId ? 'HOME' : teamId != null && teamId === teams.awayId ? 'AWAY' : null
    if (!side) continue
    const { main, second } = actorNames(event)
    const scorerAthlete = event.participants?.[0]?.athlete
    const assistAthlete = event.participants?.[1]?.athlete

    goals.push({
      side,
      teamId,
      teamName: side === 'HOME' ? teams.homeName : teams.awayName,
      teamCode: side === 'HOME' ? teams.homeCode : teams.awayCode,
      playerId: id(scorerAthlete?.id),
      playerName: main ?? 'Unknown',
      minute: event.clock?.displayValue || null,
      goalType: null,
      ownGoal: kind === 'own-goal',
      // Only a goal from open play carries an assister; an own goal's second
      // participant, when there is one, is not one.
      assistPlayerId: kind === 'goal' ? id(assistAthlete?.id) : null,
      assistPlayerName: kind === 'goal' ? second : null,
    })
  }
  return goals
}

function cardOf(kind: TimelineEventKind): BookingEvent['card'] | null {
  if (kind === 'yellow') return 'YELLOW'
  if (kind === 'second-yellow') return 'SECOND_YELLOW'
  if (kind === 'red') return 'RED'
  return null
}

export function parseEspnBookings(summary: EspnSummary, homeId: string | null): BookingEvent[] {
  const out: BookingEvent[] = []
  for (const event of summary.keyEvents ?? []) {
    const kind = espnEventKind(event)
    const card = kind ? cardOf(kind) : null
    if (!card) continue
    const teamId = id(event.team?.id)
    if (teamId == null) continue
    const { main } = actorNames(event)
    out.push({
      side: teamId === homeId ? 'HOME' : 'AWAY',
      playerId: id(event.participants?.[0]?.athlete?.id),
      playerName: main ?? 'Unknown',
      minute: event.clock?.displayValue || null,
      card,
    })
  }
  return out
}

export function parseEspnSubstitutions(summary: EspnSummary, homeId: string | null): SubstitutionEvent[] {
  const out: SubstitutionEvent[] = []
  for (const event of summary.keyEvents ?? []) {
    if (espnEventKind(event) !== 'sub') continue
    const teamId = id(event.team?.id)
    if (teamId == null) continue
    const { main, second } = actorNames(event)
    out.push({
      side: teamId === homeId ? 'HOME' : 'AWAY',
      minute: event.clock?.displayValue || null,
      playerOnId: id(event.participants?.[0]?.athlete?.id),
      playerOnName: main ?? 'Unknown',
      playerOffId: id(event.participants?.[1]?.athlete?.id),
      playerOffName: second ?? 'Unknown',
    })
  }
  return out
}

function statsOf(team: EspnBoxscoreTeam | undefined): Map<string, number | null> {
  const map = new Map<string, number | null>()
  for (const stat of team?.statistics ?? []) {
    if (stat.name) map.set(stat.name, num(stat.value ?? stat.displayValue))
  }
  return map
}

export function parseEspnMatchStats(summary: EspnSummary): Record<string, TeamMatchStats> {
  const out: Record<string, TeamMatchStats> = {}
  for (const team of summary.boxscore?.teams ?? []) {
    const teamId = id(team.team?.id)
    if (!teamId) continue
    const s = statsOf(team)
    out[teamId] = {
      possession: s.get('possessionPct') ?? null,
      attempts: s.get('totalShots') ?? null,
      onTarget: s.get('shotsOnTarget') ?? null,
      passes: s.get('totalPasses') ?? null,
      passesCompleted: s.get('accuratePasses') ?? null,
      crosses: s.get('totalCrosses') ?? null,
      corners: s.get('wonCorners') ?? null,
      fouls: s.get('foulsCommitted') ?? null,
      offsides: s.get('offsides') ?? null,
      // ESPN's boxscore has no distance, pressure or turnover counters.
      distanceKm: null,
      pressuresApplied: null,
      forcedTurnovers: null,
    }
  }
  return out
}

// ESPN spells a position by where it is played ("CD-L" is the left centre-back),
// so the group is the leading letters, not the whole token.
export function mapEspnPosition(abbreviation: string | null | undefined): SquadPlayer['position'] {
  const a = (abbreviation ?? '').toUpperCase()
  if (!a || a === 'SUB') return null
  if (a === 'G' || a.startsWith('GK')) return 'GK'
  if (a.startsWith('CD') || a.startsWith('LB') || a.startsWith('RB') || a.startsWith('SW') || a === 'D') return 'DF'
  if (a.startsWith('CF') || a.startsWith('LF') || a.startsWith('RF') || a.startsWith('ST') || a === 'F' || a === 'RCF') {
    return 'FW'
  }
  if (a.startsWith('DM') || a.startsWith('CM') || a.startsWith('AM') || a.startsWith('LM') || a.startsWith('RM') || a === 'M') {
    return 'MF'
  }
  return null
}

function toSquadPlayer(entry: EspnRosterEntry): SquadPlayer {
  return {
    playerId: id(entry.athlete?.id) ?? '',
    name: entry.athlete?.displayName || entry.athlete?.shortName || '?',
    shirtNumber: num(entry.jersey),
    position: mapEspnPosition(entry.position?.abbreviation),
    // ESPN publishes no captain flag on a match roster.
    captain: false,
    pictureUrl: entry.athlete?.headshot?.href || null,
  }
}

function coachName(roster: EspnRoster | undefined): string | null {
  const c = roster?.coach?.[0]
  if (!c) return null
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
  return name || null
}

function toTeamLineup(roster: EspnRoster | undefined): TeamLineup {
  const entries = roster?.roster ?? []
  return {
    formation: roster?.formation || null,
    coach: coachName(roster),
    startingXI: entries.filter((e) => e.starter).map(toSquadPlayer),
    bench: entries.filter((e) => !e.starter).map(toSquadPlayer),
  }
}

export function parseEspnLineups(summary: EspnSummary): MatchLineups | null {
  const rosters = summary.rosters ?? []
  if (!rosters.length) return null

  const home = rosters.find((r) => r.homeAway === 'home') ?? rosters[0]
  const away = rosters.find((r) => r.homeAway === 'away') ?? rosters[1]
  const lineups = { home: toTeamLineup(home), away: toTeamLineup(away) }

  return {
    // The roster exists well before kickoff but is empty of starters until the
    // official XI drops; the UI shows nothing rather than a guessed side.
    available: lineups.home.startingXI.length > 0 && lineups.away.startingXI.length > 0,
    ...lineups,
  }
}

export function espnPlayerNames(summary: EspnSummary): Record<string, string> {
  const names: Record<string, string> = {}
  for (const roster of summary.rosters ?? []) {
    for (const entry of roster.roster ?? []) {
      const playerId = id(entry.athlete?.id)
      const name = entry.athlete?.displayName
      if (playerId && name) names[playerId] = name
    }
  }
  return names
}

export interface EspnDetailTeams {
  homeId: string | null
  awayId: string | null
  homeName: string
  homeCode: string | null
  awayName: string
  awayCode: string | null
}

// Which side is which, read off whichever part of the document is populated:
// the rosters carry names and codes but only exist once a squad is published,
// while the header competitors are there from the moment a fixture is listed.
export function espnSummaryTeams(summary: EspnSummary): EspnDetailTeams {
  const rosters = summary.rosters ?? []
  const rosterHome = rosters.find((r) => r.homeAway === 'home')
  const rosterAway = rosters.find((r) => r.homeAway === 'away')

  const competitors = summary.header?.competitions?.[0]?.competitors ?? []
  const headerHome = competitors.find((c) => c.homeAway === 'home')
  const headerAway = competitors.find((c) => c.homeAway === 'away')

  return {
    homeId: id(rosterHome?.team?.id) ?? id(headerHome?.team?.id),
    awayId: id(rosterAway?.team?.id) ?? id(headerAway?.team?.id),
    homeName: rosterHome?.team?.displayName || 'TBD',
    homeCode: rosterHome?.team?.abbreviation || null,
    awayName: rosterAway?.team?.displayName || 'TBD',
    awayCode: rosterAway?.team?.abbreviation || null,
  }
}

export function parseEspnMatchDetail(summary: EspnSummary, eventId: string, teams: EspnDetailTeams): MatchDetail {
  const boxscore = summary.boxscore?.teams ?? []
  const homeBox = boxscore.find((t) => id(t.team?.id) === teams.homeId) ?? boxscore[0]
  const awayBox = boxscore.find((t) => id(t.team?.id) === teams.awayId) ?? boxscore[1]
  const homeStats = statsOf(homeBox)
  const awayStats = statsOf(awayBox)
  const status = summary.header?.competitions?.[0]?.status

  return {
    minute: status?.displayClock || null,
    halfTime: status?.type?.name === 'STATUS_HALFTIME',
    possessionHome: homeStats.get('possessionPct') ?? null,
    possessionAway: awayStats.get('possessionPct') ?? null,
    attendance: num(summary.gameInfo?.attendance),
    stadium: summary.gameInfo?.venue?.fullName || null,
    cards: {
      home: { yellow: homeStats.get('yellowCards') ?? 0, red: homeStats.get('redCards') ?? 0 },
      away: { yellow: awayStats.get('yellowCards') ?? 0, red: awayStats.get('redCards') ?? 0 },
    },
    goals: parseEspnGoals(summary, teams),
    bookings: parseEspnBookings(summary, teams.homeId),
    substitutions: parseEspnSubstitutions(summary, teams.homeId),
    playerNames: espnPlayerNames(summary),
    // The adapter reuses the event id as the stats key, so getMatchStats reads
    // the same cached summary document rather than fetching a second one.
    ifesId: eventId,
    homeTeamId: teams.homeId,
    awayTeamId: teams.awayId,
  }
}
