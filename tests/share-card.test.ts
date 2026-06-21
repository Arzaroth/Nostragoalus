import { describe, expect, it } from 'vitest'
import { buildShareCardData, type ShareCardInput } from '../server/utils/share/card'

const KICKOFF = new Date('2026-06-20T18:00:00Z')
const PRE = new Date('2026-06-20T12:00:00Z')
const POST = new Date('2026-06-20T20:00:00Z')

function input(over: Partial<ShareCardInput> = {}): ShareCardInput {
  return {
    homeGoals: 3,
    awayGoals: 1,
    isJoker: true,
    baseTier: 'EXACT',
    totalPoints: 14,
    crowdShare: 0.04,
    kickoffTime: KICKOFF,
    status: 'FINISHED',
    fullTimeHome: 3,
    fullTimeAway: 1,
    penaltiesHome: null,
    penaltiesAway: null,
    homeTeam: 'England',
    awayTeam: 'Senegal',
    homeTeamCode: 'ENG',
    awayTeamCode: 'SEN',
    roundLabel: 'Group Stage',
    group: 'Group F',
    competitionName: 'FIFA World Cup 2026',
    ownerName: 'Arzaroth',
    ...over,
  }
}

describe('buildShareCardData', () => {
  it('result: finished + scored exposes score, actual, tier, points, rarity', () => {
    const c = buildShareCardData(input(), { mode: 'result', locale: 'en' }, POST)
    expect(c.state).toBe('result')
    expect([c.predHome, c.predAway]).toEqual([3, 1])
    expect([c.actualHome, c.actualAway]).toEqual([3, 1])
    expect(c.tier).toBe('EXACT')
    expect(c.totalPoints).toBe(14)
    expect(c.crowdSharePct).toBe(4)
    expect(c.isJoker).toBe(true)
  })

  it('result: null crowdShare -> null pct; string share -> rounded percent', () => {
    expect(buildShareCardData(input({ crowdShare: null }), { mode: 'result', locale: 'en' }, POST).crowdSharePct).toBeNull()
    expect(buildShareCardData(input({ crowdShare: '0.125' }), { mode: 'result', locale: 'en' }, POST).crowdSharePct).toBe(13)
  })

  it('result: non-finite crowdShare -> null pct', () => {
    expect(buildShareCardData(input({ crowdShare: 'not-a-number' }), { mode: 'result', locale: 'en' }, POST).crowdSharePct).toBeNull()
  })

  it('live: kicked off but not finished -> no actual/tier/points', () => {
    const c = buildShareCardData(input({ status: 'LIVE', totalPoints: null }), { mode: 'result', locale: 'en' }, POST)
    expect(c.state).toBe('live')
    expect([c.predHome, c.predAway]).toEqual([3, 1])
    expect(c.actualHome).toBeNull()
    expect(c.tier).toBeNull()
    expect(c.totalPoints).toBeNull()
    expect(c.crowdSharePct).toBeNull()
  })

  it('live: finished but not yet scored -> live (no stale result)', () => {
    expect(buildShareCardData(input({ totalPoints: null }), { mode: 'result', locale: 'en' }, POST).state).toBe('live')
  })

  it('reveal: pre-kickoff owner reveal shows the score, no actual, no rarity', () => {
    const c = buildShareCardData(input({ crowdShare: 0.5 }), { mode: 'reveal', locale: 'en' }, PRE)
    expect(c.state).toBe('reveal')
    expect([c.predHome, c.predAway]).toEqual([3, 1])
    expect(c.actualHome).toBeNull()
    expect(c.crowdSharePct).toBeNull()
  })

  it('sealed: pre-kickoff hides the score entirely', () => {
    const c = buildShareCardData(input(), { mode: 'sealed', locale: 'en' }, PRE)
    expect(c.state).toBe('sealed')
    expect(c.predHome).toBeNull()
    expect(c.predAway).toBeNull()
    expect(c.isJoker).toBe(false)
  })

  it('defensive: a pre-kickoff result mode never leaks (-> sealed)', () => {
    expect(buildShareCardData(input(), { mode: 'result', locale: 'en' }, PRE).state).toBe('sealed')
  })

  it('accepts a string kickoffTime', () => {
    const c = buildShareCardData(input({ kickoffTime: KICKOFF.toISOString() }), { mode: 'sealed', locale: 'en' }, PRE)
    expect(c.state).toBe('sealed')
  })
})
