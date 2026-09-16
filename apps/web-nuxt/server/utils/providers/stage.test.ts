import { describe, expect, it } from 'vitest'
import type { NormalizedMatch } from '../../../shared/types/match'
import { assignMatchdays, mapStageFromName, parseGroupLetter, parseGroupNameStrict } from './stage'

describe('mapStageFromName', () => {
  it('maps each provider stage name to its app stage', () => {
    expect(mapStageFromName('Group F')).toBe('GROUP')
    expect(mapStageFromName('Round of 32')).toBe('R32')
    expect(mapStageFromName('Round of 16')).toBe('R16')
    expect(mapStageFromName('Quarter-finals')).toBe('QF')
    expect(mapStageFromName('Semi-finals')).toBe('SF')
    expect(mapStageFromName('Third-place play-off')).toBe('THIRD_PLACE')
    expect(mapStageFromName('Final')).toBe('FINAL')
  })

  it('keeps the names that contain "final" off FINAL', () => {
    expect(mapStageFromName('Final Tournament')).toBe('GROUP')
    expect(mapStageFromName('Bronze final')).toBe('THIRD_PLACE')
    expect(mapStageFromName('3rd place final')).toBe('THIRD_PLACE')
  })

  it('falls back to GROUP on an unknown or missing name', () => {
    expect(mapStageFromName('Friendly')).toBe('GROUP')
    expect(mapStageFromName(null)).toBe('GROUP')
    expect(mapStageFromName(undefined)).toBe('GROUP')
  })
})

describe('parseGroupLetter', () => {
  it('reads the trailing group letter, else null', () => {
    expect(parseGroupLetter('Group F')).toBe('F')
    expect(parseGroupLetter('group a')).toBe('A')
    expect(parseGroupLetter('Group M')).toBeNull()
    expect(parseGroupLetter(null)).toBeNull()
  })

  it('accepts a localized group name, which is why the loose form exists', () => {
    expect(parseGroupLetter('Groupe A')).toBe('A')
    expect(parseGroupLetter('Gruppe B')).toBe('B')
  })
})

describe('parseGroupNameStrict', () => {
  it('reads a whole-string group name', () => {
    expect(parseGroupNameStrict('Group F')).toBe('F')
    expect(parseGroupNameStrict('group a')).toBe('A')
    expect(parseGroupNameStrict('Group M')).toBeNull()
    expect(parseGroupNameStrict(null)).toBeNull()
  })

  it('refuses a competition name that merely ends in a letter', () => {
    // The loose parser reads this as group E, which is the whole point.
    expect(parseGroupLetter('Premier League')).toBe('E')
    expect(parseGroupNameStrict('Premier League')).toBeNull()
    expect(parseGroupNameStrict('Bundesliga')).toBeNull()
  })
})

describe('assignMatchdays: one table, no pool letters', () => {
  // The 2025 Six Nations as the feed serves it: every fixture is "Pool" with an
  // empty subType, so there is no letter to bucket by. Five rounds of three,
  // which is what the championship actually played.
  const SIX_NATIONS_2025: [string, string, string][] = [
    ['2025-01-31T20:15:00Z', 'France', 'Wales'],
    ['2025-02-01T14:15:00Z', 'Scotland', 'Italy'],
    ['2025-02-01T16:45:00Z', 'Ireland', 'England'],
    ['2025-02-08T14:15:00Z', 'Italy', 'Wales'],
    ['2025-02-08T16:45:00Z', 'England', 'France'],
    ['2025-02-09T15:00:00Z', 'Scotland', 'Ireland'],
    ['2025-02-22T14:15:00Z', 'Wales', 'Ireland'],
    ['2025-02-22T16:45:00Z', 'England', 'Scotland'],
    ['2025-02-23T15:00:00Z', 'Italy', 'France'],
    ['2025-03-08T14:15:00Z', 'Ireland', 'France'],
    ['2025-03-08T16:45:00Z', 'Scotland', 'Wales'],
    ['2025-03-09T15:00:00Z', 'England', 'Italy'],
    ['2025-03-15T14:15:00Z', 'Italy', 'Ireland'],
    ['2025-03-15T16:45:00Z', 'Wales', 'England'],
    ['2025-03-15T20:00:00Z', 'France', 'Scotland'],
  ]

  const table = (rows: [string, string, string][]): NormalizedMatch[] =>
    rows.map(([kickoffTime, home, away], i) => ({
      providerMatchId: `m${i}`,
      providerStageId: null,
      stage: 'GROUP' as const,
      group: null,
      matchday: null,
      homeTeam: { name: home, code: null, crest: null },
      awayTeam: { name: away, code: null, crest: null },
      kickoffTime,
      status: 'SCHEDULED' as const,
      score: { fullTime: { home: null, away: null } },
      winner: null,
    }))

  it('splits the Six Nations into its five rounds of three', () => {
    const out = assignMatchdays(table(SIX_NATIONS_2025))
    const perRound = new Map<number, number>()
    for (const m of out) perRound.set(m.matchday!, (perRound.get(m.matchday!) ?? 0) + 1)
    expect([...perRound.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
      [5, 3],
    ])
    // Every team plays exactly once per round, which is what a round IS.
    for (const md of perRound.keys()) {
      const sides = out.filter((m) => m.matchday === md).flatMap((m) => [m.homeTeam.name, m.awayTeam.name])
      expect(new Set(sides).size).toBe(sides.length)
    }
  })

  it('reads the rounds off the fixtures, not the calendar', () => {
    // Same championship played end to end on consecutive days: a date-gap rule
    // would call it one round, the team-repeat rule still finds five.
    const squashed = SIX_NATIONS_2025.map(
      ([, home, away], i) => [`2025-02-${String(i + 1).padStart(2, '0')}T12:00:00Z`, home, away] as [string, string, string],
    )
    const out = assignMatchdays(table(squashed))
    expect(Math.max(...out.map((m) => m.matchday!))).toBe(5)
  })

  it('numbers a twenty-team league ten matches to the round', () => {
    const teams = Array.from({ length: 20 }, (_, i) => `Team ${i}`)
    const round: [string, string, string][] = []
    for (let i = 0; i < 10; i++) round.push([`2026-08-15T1${i % 6}:00:00Z`, teams[i]!, teams[19 - i]!])
    const out = assignMatchdays(table(round))
    expect(new Set(out.map((m) => m.matchday)).size).toBe(1)
  })

  it('orders the fixtures itself rather than trusting the feed', () => {
    // World Rugby's schedule is keyed by matchId, and a fixture rescheduled
    // after publication keeps its low id and gains a late date. Handed the
    // championship shuffled, the rounds still come out right.
    const shuffled = [...SIX_NATIONS_2025].sort(() => Math.random() - 0.5)
    const out = assignMatchdays(table(shuffled))
    for (const m of out) {
      const round = SIX_NATIONS_2025.findIndex(([kickoff]) => kickoff === m.kickoffTime)
      expect(m.matchday).toBe(Math.floor(round / 3) + 1)
    }
  })

  it('does not let an undrawn side close a round', () => {
    // 'TBD' is a hole in the draw on every feed. Counted as a team it meets
    // itself in the next fixture and splits the round, and every round after.
    const rows = table([
      ['2026-02-06T20:00:00Z', 'France', 'TBD'],
      ['2026-02-07T15:00:00Z', 'TBD', 'Italy'],
      ['2026-02-07T17:00:00Z', 'Wales', 'Scotland'],
      ['2026-02-14T15:00:00Z', 'France', 'Italy'],
    ])
    const out = assignMatchdays(rows)
    expect(out.map((m) => m.matchday)).toEqual([1, 1, 1, 2])
  })

  it('leaves the knockout rounds alone', () => {
    const rows = table([['2025-01-31T20:00:00Z', 'France', 'Wales']])
    const ko: NormalizedMatch = { ...rows[0]!, providerMatchId: 'ko', stage: 'FINAL', matchday: null }
    assignMatchdays([...rows, ko])
    expect(ko.matchday).toBeNull()
  })

  it('still buckets by pool when the competition has letters', () => {
    // The pool path must win whenever any fixture carries one, or a World Cup
    // would be renumbered as a single table.
    const rows = table([
      ['2026-06-11T16:00:00Z', 'A1', 'A2'],
      ['2026-06-11T19:00:00Z', 'B1', 'B2'],
      ['2026-06-15T16:00:00Z', 'A1', 'A3'],
      ['2026-06-15T19:00:00Z', 'A2', 'A4'],
    ])
    rows[0]!.group = 'A'
    rows[1]!.group = 'B'
    rows[2]!.group = 'A'
    rows[3]!.group = 'A'
    const out = assignMatchdays(rows)
    // Pool A pairs off two to a matchday and pool B is numbered independently.
    // The single-table rule would have split on A1 repeating and given
    // [1, 1, 2, 2] with B in a round of its own, so this tells them apart.
    expect(out.map((m) => `${m.group}${m.matchday}`)).toEqual(['A1', 'B1', 'A1', 'A2'])
  })
})
