import { describe, it, expect } from 'vitest'
import { pitchRows } from './lineup'
import type { SquadPlayer, TeamLineup } from '#shared/types/match'

const p = (playerId: string, position: SquadPlayer['position'], shirtNumber: number | null = null): SquadPlayer => ({
  playerId,
  name: playerId.toUpperCase(),
  shirtNumber,
  position,
  captain: false,
  pictureUrl: null,
})
const team = (formation: string | null, startingXI: SquadPlayer[]): TeamLineup => ({ formation, coach: null, startingXI, bench: [] })

// Feed categories say 4 DF / 5 MF / 1 FW, but the declared formation is 3-4-3.
const xi343 = [
  p('gk', 'GK', 1),
  p('d1', 'DF', 4), p('d2', 'DF', 6), p('d3', 'DF', 15), p('d4', 'DF', 18),
  p('m1', 'MF', 5), p('m2', 'MF', 10), p('m3', 'MF', 17), p('m4', 'MF', 19), p('m5', 'MF', 23),
  p('f1', 'FW', 7),
]

describe('pitchRows', () => {
  it('lays the XI into the formation bands so the pitch matches the chip', () => {
    const rows = pitchRows(team('3-4-3', xi343))
    // attack-first: 3 (FW band), 4 (MF band), 3 (DF band), then the keeper.
    expect(rows.map((r) => r.players.length)).toEqual([3, 4, 3, 1])
    // outfield sliced in order (defence first), so the back band is the first 3.
    expect(rows[2].players.map((q) => q.playerId)).toEqual(['d1', 'd2', 'd3'])
    expect(rows[0].players.map((q) => q.playerId)).toEqual(['m4', 'm5', 'f1'])
    expect(rows.at(-1)).toMatchObject({ pos: 'GK', players: [{ playerId: 'gk' }] })
  })

  it('honours a four-band formation that accounts for the ten outfield players', () => {
    const rows = pitchRows(team('4-2-3-1', xi343))
    expect(rows.map((r) => r.players.length)).toEqual([1, 3, 2, 4, 1])
  })

  it('falls back to position buckets when there is no formation string', () => {
    const xi = [p('gk', 'GK', 1), p('d', 'DF', 4), p('m', 'MF', 8), p('f', 'FW', 9), p('u', null, 6)]
    const rows = pitchRows(team(null, xi))
    expect(rows.map((r) => r.pos)).toEqual(['FW', 'MF', 'DF', 'GK'])
    // the position-less player joins the midfield row
    expect(rows.find((r) => r.pos === 'MF')!.players.map((q) => q.playerId)).toEqual(['m', 'u'])
  })

  it('falls back to buckets on a malformed or sum-mismatched formation', () => {
    const xi = [p('gk', 'GK', 1), p('d', 'DF', 4), p('m', 'MF', 8), p('f', 'FW', 9)]
    expect(pitchRows(team('abc', xi)).map((r) => r.pos)).toEqual(['FW', 'MF', 'DF', 'GK']) // single token -> not a shape
    expect(pitchRows(team('3-x-3', xi)).map((r) => r.pos)).toEqual(['FW', 'MF', 'DF', 'GK']) // NaN band
    expect(pitchRows(team('0-4-3', xi)).map((r) => r.pos)).toEqual(['FW', 'MF', 'DF', 'GK']) // non-positive band
    expect(pitchRows(team('4-3-3', xi)).map((r) => r.pos)).toEqual(['FW', 'MF', 'DF', 'GK']) // bands sum 10, only 3 outfield
  })

  it('places an unknown-category player in midfield', () => {
    const rows = pitchRows(team(null, [p('x', 'ZZ' as never, 1)]))
    expect(rows).toEqual([{ pos: 'MF', players: [{ playerId: 'x', name: 'X', shirtNumber: 1, position: 'ZZ', captain: false, pictureUrl: null }] }])
  })

  it('omits the keeper row when no goalkeeper is in the XI', () => {
    const rows = pitchRows(team('1-1', [p('a', 'DF', 2), p('b', 'FW', 9)]))
    expect(rows.map((r) => r.players.length)).toEqual([1, 1])
    expect(rows.some((r) => r.pos === 'GK')).toBe(false)
  })
})
