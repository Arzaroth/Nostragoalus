import { describe, it, expect } from 'vitest'
import { canonicalTeamName, matchEventsToFixtures, normalizeTeamName, type OddsFixture } from './matcher'
import type { OddsEvent } from './types'

const KICKOFF = new Date('2026-06-15T18:00:00Z')
const HOUR = 60 * 60 * 1000

function event(over: Partial<OddsEvent> = {}): OddsEvent {
  return { ref: 'e1', homeName: 'France', awayName: 'Brazil', kickoff: KICKOFF, finished: false, ...over }
}

function fixture(over: Partial<OddsFixture> = {}): OddsFixture {
  return { id: 'm1', homeTeam: 'France', awayTeam: 'Brazil', kickoffTime: KICKOFF, ...over }
}

describe('normalizeTeamName', () => {
  it('folds case, diacritics, punctuation and a leading article', () => {
    expect(normalizeTeamName('Türkiye')).toBe('turkiye')
    expect(normalizeTeamName("Côte d'Ivoire")).toBe('cote d ivoire')
    expect(normalizeTeamName('  USA  ')).toBe('usa')
    expect(normalizeTeamName('The Netherlands')).toBe('netherlands')
    expect(normalizeTeamName('Bosnia-Herzegovina')).toBe('bosnia herzegovina')
  })
})

describe('canonicalTeamName', () => {
  it('maps bookmaker names onto fixture names through the alias table', () => {
    expect(canonicalTeamName('South Korea')).toBe('korea republic')
    expect(canonicalTeamName('Iran')).toBe('ir iran')
    expect(canonicalTeamName('Turkey')).toBe('turkiye')
    expect(canonicalTeamName('Ivory Coast')).toBe('cote d ivoire')
    expect(canonicalTeamName('United States')).toBe('usa')
    expect(canonicalTeamName('France')).toBe('france')
  })
})

describe('matchEventsToFixtures', () => {
  it('matches on canonical names within the kickoff window', () => {
    const result = matchEventsToFixtures(
      [event({ homeName: 'Turkey', awayName: 'South Korea', kickoff: new Date(KICKOFF.getTime() + 2 * HOUR) })],
      [fixture({ homeTeam: 'Türkiye', awayTeam: 'Korea Republic' })],
    )
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0]).toMatchObject({ fixture: { id: 'm1' }, swapped: false })
    expect(result.unmatched).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(0)
  })

  it('flags reversed home/away orientation', () => {
    const result = matchEventsToFixtures([event({ homeName: 'Brazil', awayName: 'France' })], [fixture()])
    expect(result.matched[0]).toMatchObject({ fixture: { id: 'm1' }, swapped: true })
  })

  it('leaves events outside the kickoff window unmatched', () => {
    const result = matchEventsToFixtures([event({ kickoff: new Date(KICKOFF.getTime() + 7 * HOUR) })], [fixture()])
    expect(result.matched).toHaveLength(0)
    expect(result.unmatched).toHaveLength(1)
  })

  it('respects a custom window', () => {
    const close = event({ kickoff: new Date(KICKOFF.getTime() + 30 * 60 * 1000) })
    expect(matchEventsToFixtures([close], [fixture()], { windowMs: 15 * 60 * 1000 }).unmatched).toHaveLength(1)
    expect(matchEventsToFixtures([close], [fixture()], { windowMs: HOUR }).matched).toHaveLength(1)
  })

  it('never guesses between two candidate fixtures', () => {
    const result = matchEventsToFixtures(
      [event()],
      [fixture(), fixture({ id: 'm2', kickoffTime: new Date(KICKOFF.getTime() + HOUR) })],
    )
    expect(result.matched).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(1)
  })

  it('drops every event when several claim the same fixture', () => {
    const result = matchEventsToFixtures(
      [event(), event({ ref: 'e2', homeName: 'Brazil', awayName: 'France' })],
      [fixture()],
    )
    expect(result.matched).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(2)
  })

  it('placeholder fixtures never match real teams', () => {
    const result = matchEventsToFixtures([event()], [fixture({ homeTeam: 'Winner A', awayTeam: 'Runner-up B' })])
    expect(result.matched).toHaveLength(0)
    expect(result.unmatched).toHaveLength(1)
  })
})
