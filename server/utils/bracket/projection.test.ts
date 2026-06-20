import { describe, it, expect } from 'vitest'
import { parseSlotPlaceholder, projectBracket, projectSlots, type SlotRef } from './projection'
import type { GroupStandings, StandingRow } from '../stats/standings'
import type { BracketMatch, NormalizedBracket } from '../../../shared/types/match'

function row(code: string | null, points: number, gd = 0, gf = 0): StandingRow {
  return { code, name: code ?? 'TBD', played: 1, won: 0, drawn: 0, lost: 0, gf, ga: 0, gd, points }
}
function grp(group: string, rows: StandingRow[]): GroupStandings {
  return { group, rows }
}

describe('parseSlotPlaceholder', () => {
  it('reads compact rank forms', () => {
    expect(parseSlotPlaceholder('1A')).toEqual({ kind: 'winner', group: 'A' })
    expect(parseSlotPlaceholder('2B')).toEqual({ kind: 'runnerUp', group: 'B' })
    expect(parseSlotPlaceholder('2 C')).toEqual({ kind: 'runnerUp', group: 'C' })
  })
  it('reads worded rank forms', () => {
    expect(parseSlotPlaceholder('Winner Group A')).toEqual({ kind: 'winner', group: 'A' })
    expect(parseSlotPlaceholder('Runner-up B')).toEqual({ kind: 'runnerUp', group: 'B' })
    expect(parseSlotPlaceholder('1st A')).toEqual({ kind: 'winner', group: 'A' })
    expect(parseSlotPlaceholder('2nd D')).toEqual({ kind: 'runnerUp', group: 'D' })
    expect(parseSlotPlaceholder('Winners F')).toEqual({ kind: 'winner', group: 'F' })
  })
  it('reads third-placed forms (worded and compact)', () => {
    expect(parseSlotPlaceholder('3rd C/D/E/F')).toEqual({ kind: 'third', groups: ['C', 'D', 'E', 'F'] })
    expect(parseSlotPlaceholder('Third placed C/D/F')).toEqual({ kind: 'third', groups: ['C', 'D', 'F'] })
    expect(parseSlotPlaceholder('3CDEF')).toEqual({ kind: 'third', groups: ['C', 'D', 'E', 'F'] })
    expect(parseSlotPlaceholder('3 C/D/E/F')).toEqual({ kind: 'third', groups: ['C', 'D', 'E', 'F'] })
    expect(parseSlotPlaceholder('3A')).toEqual({ kind: 'third', groups: ['A'] })
    expect(parseSlotPlaceholder('3CCD')).toEqual({ kind: 'third', groups: ['C', 'D'] }) // de-duped
  })
  it('treats match-winner refs and noise as unprojectable', () => {
    expect(parseSlotPlaceholder('Winner 49')).toEqual({ kind: 'other' })
    expect(parseSlotPlaceholder('W49')).toEqual({ kind: 'other' })
    expect(parseSlotPlaceholder('Winner 3')).toEqual({ kind: 'other' }) // bare 3, not a group third
    expect(parseSlotPlaceholder('TBD')).toEqual({ kind: 'other' })
    expect(parseSlotPlaceholder('3rd place')).toEqual({ kind: 'other' }) // marker, no groups
    expect(parseSlotPlaceholder('')).toEqual({ kind: 'other' })
    expect(parseSlotPlaceholder(null)).toEqual({ kind: 'other' })
  })
})

describe('projectSlots', () => {
  const standings = [
    grp('A', [row('ARG', 9), row('POL', 6), row('MEX', 3)]),
    grp('B', [row('ENG', 9), row('USA', 6), row('IRN', 3, -1)]),
  ]
  const ready = { A: true, B: true }

  it('projects winner and runner-up from a ready group', () => {
    const out = projectSlots(
      [
        { key: 's1', ref: { kind: 'winner', group: 'A' } },
        { key: 's2', ref: { kind: 'runnerUp', group: 'A' } },
      ],
      { standings, groupReady: ready, thirdsToQualify: 0 },
    )
    expect(out.get('s1')).toEqual({ code: 'ARG', name: 'ARG' })
    expect(out.get('s2')).toEqual({ code: 'POL', name: 'POL' })
  })

  it('omits a slot whose group is not ready, or missing, or has no team yet', () => {
    const out = projectSlots(
      [
        { key: 'notReady', ref: { kind: 'winner', group: 'A' } },
        { key: 'missing', ref: { kind: 'winner', group: 'Z' } },
        { key: 'noTeam', ref: { kind: 'runnerUp', group: 'C' } },
      ],
      {
        standings: [...standings, grp('C', [row('FRA', 9), row(null, 3)])],
        groupReady: { A: false, Z: true, C: true },
        thirdsToQualify: 0,
      },
    )
    expect(out.size).toBe(0)
  })

  it('assigns best thirds greedily within eligible groups, once each, capped', () => {
    const four = [
      grp('A', [row('ARG', 9), row('POL', 6), row('TA', 3, 1)]),
      grp('B', [row('ENG', 9), row('USA', 6), row('TB', 3, 0)]),
      grp('C', [row('FRA', 9), row('DEN', 6), row('TC', 4)]),
      grp('D', [row('BRA', 9), row('SUI', 6), row('TD', 1)]),
    ]
    const out = projectSlots(
      [
        { key: 't1', ref: { kind: 'third', groups: ['C', 'D'] } },
        { key: 't2', ref: { kind: 'third', groups: ['A', 'B'] } },
        { key: 't3', ref: { kind: 'third', groups: ['D'] } }, // D's third didn't qualify
      ],
      { standings: four, groupReady: { A: true, B: true, C: true, D: true }, thirdsToQualify: 2 },
    )
    // Ranked thirds: TC(4) > TA(3,gd1) > TB(3,gd0) > TD(1); top 2 qualify.
    expect(out.get('t1')).toEqual({ code: 'TC', name: 'TC' }) // C is eligible + top
    expect(out.get('t2')).toEqual({ code: 'TA', name: 'TA' }) // A eligible, TC already used
    expect(out.has('t3')).toBe(false) // only TC/TA qualified, neither in {D}
  })

  it('fills a narrowly-eligible third slot instead of starving it (most-constrained first)', () => {
    const four = [
      grp('A', [row('ARG', 9), row('POL', 6), row('TA', 5)]), // A's third ranks above B's
      grp('B', [row('ENG', 9), row('USA', 6), row('TB', 3)]),
    ]
    const out = projectSlots(
      [
        { key: 'broad', ref: { kind: 'third', groups: ['A', 'B'] } }, // listed first
        { key: 'narrow', ref: { kind: 'third', groups: ['A'] } }, // only A's third fits
      ],
      { standings: four, groupReady: { A: true, B: true }, thirdsToQualify: 2 },
    )
    // Input order would give broad->TA, starving narrow. Most-constrained-first
    // gives narrow->TA, broad->TB, filling both.
    expect(out.get('narrow')).toEqual({ code: 'TA', name: 'TA' })
    expect(out.get('broad')).toEqual({ code: 'TB', name: 'TB' })
  })

  it('picks the top qualifying third for an any-group slot', () => {
    const four = [
      grp('A', [row('ARG', 9), row('POL', 6), row('TA', 3)]),
      grp('B', [row('ENG', 9), row('USA', 6), row('TB', 5)]),
    ]
    const out = projectSlots([{ key: 'any', ref: { kind: 'third', groups: [] } }], {
      standings: four,
      groupReady: { A: true, B: true },
      thirdsToQualify: 1,
    })
    expect(out.get('any')).toEqual({ code: 'TB', name: 'TB' })
  })

  it('skips thirds until every group is ready', () => {
    const out = projectSlots([{ key: 't1', ref: { kind: 'third', groups: ['A', 'B'] } }], {
      standings,
      groupReady: { A: true, B: false },
      thirdsToQualify: 2,
    })
    expect(out.size).toBe(0)
  })

  it('never projects thirds when the format takes none', () => {
    const out = projectSlots([{ key: 't1', ref: { kind: 'third', groups: ['A', 'B'] } }], {
      standings,
      groupReady: ready,
      thirdsToQualify: 0,
    })
    expect(out.size).toBe(0)
  })

  it('skips non-third slots while assigning thirds, and resolves both kinds together', () => {
    const four = [
      grp('A', [row('ARG', 9), row('POL', 6), row('TA', 3)]),
      grp('B', [row('ENG', 9), row('USA', 6), row('TB', 5)]),
    ]
    const out = projectSlots(
      [
        { key: 'w', ref: { kind: 'winner', group: 'A' } },
        { key: 't', ref: { kind: 'third', groups: [] } },
      ],
      { standings: four, groupReady: { A: true, B: true }, thirdsToQualify: 1 },
    )
    expect(out.get('w')).toEqual({ code: 'ARG', name: 'ARG' })
    expect(out.get('t')).toEqual({ code: 'TB', name: 'TB' })
  })

  it('ranks thirds by goals-for then group letter when points and GD tie', () => {
    // All three thirds: points 3, GD 1. TB has more GF; TA and TC tie fully, so
    // the group letter (A before C) breaks it.
    const groups = [
      grp('A', [row('A1', 9), row('A2', 6), row('TA', 3, 1, 2)]),
      grp('B', [row('B1', 9), row('B2', 6), row('TB', 3, 1, 5)]),
      grp('C', [row('C1', 9), row('C2', 6), row('TC', 3, 1, 2)]),
    ]
    const out = projectSlots(
      [
        { key: 'p1', ref: { kind: 'third', groups: [] } },
        { key: 'p2', ref: { kind: 'third', groups: [] } },
        { key: 'p3', ref: { kind: 'third', groups: [] } },
      ],
      { standings: groups, groupReady: { A: true, B: true, C: true }, thirdsToQualify: 3 },
    )
    expect([out.get('p1')?.code, out.get('p2')?.code, out.get('p3')?.code]).toEqual(['TB', 'TA', 'TC'])
  })

  it('projects nothing for an empty standings set', () => {
    const out = projectSlots([{ key: 't', ref: { kind: 'third', groups: [] } }], {
      standings: [],
      groupReady: {},
      thirdsToQualify: 2,
    })
    expect(out.size).toBe(0)
  })

  it('ignores a group with fewer than three teams when ranking thirds', () => {
    const out = projectSlots([{ key: 'any', ref: { kind: 'third', groups: [] } }], {
      standings: [grp('A', [row('ARG', 9), row('POL', 6)])], // only two rows -> no third
      groupReady: { A: true },
      thirdsToQualify: 1,
    })
    expect(out.size).toBe(0)
  })
})

describe('projectBracket', () => {
  function bm(providerMatchId: string, homeTeam: string, homeCode: string | null, awayTeam: string, awayCode: string | null): BracketMatch {
    return {
      providerMatchId,
      homeTeam,
      homeCode,
      awayTeam,
      awayCode,
      homeScore: null,
      awayScore: null,
      homePens: null,
      awayPens: null,
      winner: null,
      status: 'SCHEDULED',
      kickoffTime: '2026-07-01',
    }
  }
  const standings = [
    grp('A', [row('ARG', 9), row('POL', 6), row('MEX', 3)]),
    grp('B', [row('ENG', 9), row('USA', 6), row('IRN', 3)]),
  ]

  it('annotates TBD group slots, leaves official slots and match-winner refs alone', () => {
    const bracket: NormalizedBracket = {
      winner: null,
      rounds: [
        {
          name: 'R16',
          sequence: 1,
          matches: [
            bm('m1', '1A', null, '2B', null),
            bm('m2', 'Brazil', 'BRA', 'Suisse', 'SUI'),
            bm('m4', '1A', null, 'Brazil', 'BRA'), // home projected, away official
            bm('m5', 'Brazil', 'BRA', '1B', null), // home official, away projected
          ],
        },
        { name: 'QF', sequence: 2, matches: [bm('m3', 'Winner 49', null, 'Winner 50', null)] },
      ],
    }
    const out = projectBracket(bracket, standings)
    const m1 = out.rounds[0].matches[0]
    expect(m1.homeProjectedCode).toBe('ARG') // winner A
    expect(m1.awayProjectedCode).toBe('USA') // runner-up B
    expect(m1.homeCode).toBeNull() // official untouched
    const m2 = out.rounds[0].matches[1]
    expect(m2.homeProjectedCode).toBeUndefined() // already official
    const m4 = out.rounds[0].matches[2]
    expect(m4.homeProjectedCode).toBe('ARG')
    expect(m4.awayProjectedCode).toBeUndefined() // away already official
    const m5 = out.rounds[0].matches[3]
    expect(m5.homeProjectedCode).toBeUndefined() // home already official
    expect(m5.awayProjectedCode).toBe('ENG') // winner B
    const m3 = out.rounds[1].matches[0]
    expect(m3.homeProjectedCode).toBeUndefined() // match-winner ref, not projectable
  })

  it('returns the bracket unchanged when nothing can be projected', () => {
    const bracket: NormalizedBracket = {
      winner: null,
      rounds: [{ name: 'QF', sequence: 1, matches: [bm('m3', 'Winner 49', null, 'Winner 50', null)] }],
    }
    expect(projectBracket(bracket, standings)).toBe(bracket) // same reference, no copy
  })
})
