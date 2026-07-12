import { describe, expect, it } from 'vitest'
import type { WrappedDto } from '#shared/types/wrapped'
import { buildSlides, journeyPolyline } from './wrapped-slides'

function emptyWrapped(): WrappedDto {
  return {
    ready: true,
    competitionName: 'Cup',
    displayName: 'alice',
    image: null,
    totals: { totalPoints: 0, predictionPoints: 0, championPoints: 0, bestScorerPoints: 0, rank: null, players: 0, topPercent: null },
    tiers: { exact: 0, diff: 0, outcome: 0, miss: 0, predictions: 0, scoredMatches: 0, completionPct: 0 },
    streaks: { exactStreak: 0, scoringStreak: 0, perfectRounds: 0 },
    bestPick: null,
    biggestMiss: null,
    jokers: { played: 0, points: 0, best: null },
    crowd: { bonusPoints: 0, biggestBonus: null, loneWolf: 0 },
    meta: { champion: null, bestScorer: null },
    chat: { messages: 0, reactionsGiven: 0, reactionsReceived: 0, topEmoji: null },
    haul: { trophies: [], badges: [] },
    journey: [],
  }
}

const pick = (points: number): NonNullable<WrappedDto['bestPick']> => ({
  matchId: 'm1',
  homeTeam: 'A',
  awayTeam: 'B',
  homeTeamCode: null,
  awayTeamCode: null,
  roundLabel: 'Group',
  kickoffTime: '2026-06-11T12:00:00.000Z',
  predHome: 1,
  predAway: 0,
  actualHome: 1,
  actualAway: 0,
  tier: 'EXACT',
  totalPoints: points,
  bonusPoints: 0,
  isJoker: false,
  crowdSharePct: null,
})

describe('buildSlides', () => {
  it('keeps only intro, totals and summary for an empty tournament', () => {
    expect(buildSlides(emptyWrapped())).toEqual(['intro', 'totals', 'summary'])
  })

  it('adds every slide when there is something to show', () => {
    const w = emptyWrapped()
    w.tiers.predictions = 5
    w.bestPick = pick(8)
    w.biggestMiss = { ...pick(0), fieldExactPct: 40 }
    w.jokers = { played: 2, points: 6, best: pick(6) }
    w.journey = [
      { roundLabel: 'MD1', sortOrder: 1, rank: 4, players: 10, points: 3 },
      { roundLabel: 'MD2', sortOrder: 2, rank: 2, players: 10, points: 9 },
    ]
    w.crowd = { bonusPoints: 4, biggestBonus: pick(5), loneWolf: 1 }
    w.meta.champion = { teamCode: 'FRA', teamName: 'France', points: 10, hit: true }
    w.chat.messages = 3
    w.haul.trophies = [{ type: 'OVERALL', value: 42, teamCode: null }]
    expect(buildSlides(w)).toEqual([
      'intro',
      'totals',
      'tiers',
      'bestPick',
      'biggestMiss',
      'jokers',
      'journey',
      'crowd',
      'meta',
      'chat',
      'haul',
      'summary',
    ])
  })

  it('skips a scoreless best pick', () => {
    const w = emptyWrapped()
    w.tiers.predictions = 1
    w.bestPick = pick(0)
    expect(buildSlides(w)).toEqual(['intro', 'totals', 'tiers', 'summary'])
  })
})

describe('journeyPolyline', () => {
  it('returns empty for an empty journey', () => {
    expect(journeyPolyline([])).toBe('')
  })

  it('draws a flat mid-height line when the rank never changes', () => {
    const line = journeyPolyline([
      { roundLabel: 'MD1', sortOrder: 1, rank: 3, players: 10, points: 1 },
      { roundLabel: 'MD2', sortOrder: 2, rank: 3, players: 10, points: 2 },
    ])
    expect(line).toBe('0,50 100,50')
  })

  it('maps the best rank to the top and the worst to the bottom', () => {
    const line = journeyPolyline([
      { roundLabel: 'MD1', sortOrder: 1, rank: 10, players: 10, points: 0 },
      { roundLabel: 'MD2', sortOrder: 2, rank: 1, players: 10, points: 9 },
      { roundLabel: 'MD3', sortOrder: 3, rank: 5, players: 10, points: 12 },
    ])
    const [p1, p2, p3] = line.split(' ').map((p) => p.split(',').map(Number))
    expect(p1![1]).toBe(90)
    expect(p2![1]).toBe(10)
    expect(p3![1]).toBeGreaterThan(10)
    expect(p3![1]).toBeLessThan(90)
  })

  it('centers a single point', () => {
    expect(journeyPolyline([{ roundLabel: 'MD1', sortOrder: 1, rank: 2, players: 5, points: 3 }])).toBe('50,50')
  })
})
