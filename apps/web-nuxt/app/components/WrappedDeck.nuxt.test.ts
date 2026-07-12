import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { WrappedDto } from '#shared/types/wrapped'
import WrappedDeck from './WrappedDeck.vue'

function wrapped(): WrappedDto {
  return {
    ready: true,
    competitionName: 'Test Cup',
    displayName: 'alice',
    image: null,
    totals: { totalPoints: 42, predictionPoints: 32, championPoints: 10, bestScorerPoints: 0, rank: 2, players: 10, topPercent: 20 },
    tiers: { exact: 3, diff: 2, outcome: 4, miss: 1, predictions: 10, scoredMatches: 12, completionPct: 83 },
    streaks: { exactStreak: 2, scoringStreak: 5, perfectRounds: 0 },
    bestPick: {
      matchId: 'm1',
      homeTeam: 'France',
      awayTeam: 'Peru',
      homeTeamCode: 'FRA',
      awayTeamCode: 'PER',
      roundLabel: 'Matchday 1',
      kickoffTime: '2026-06-11T12:00:00.000Z',
      predHome: 2,
      predAway: 0,
      actualHome: 2,
      actualAway: 0,
      tier: 'EXACT',
      totalPoints: 8,
      bonusPoints: 2,
      isJoker: true,
      crowdSharePct: 9,
    },
    biggestMiss: null,
    jokers: { played: 2, points: 8, best: null },
    crowd: { bonusPoints: 0, biggestBonus: null, loneWolf: 0 },
    meta: { champion: null, bestScorer: null },
    chat: { messages: 0, reactionsGiven: 0, reactionsReceived: 0, topEmoji: null },
    haul: { trophies: [], badges: [] },
    journey: [],
  }
}

describe('WrappedDeck', () => {
  it('starts on the intro and advances through the deck on tap', async () => {
    const c = await mountSuspended(WrappedDeck, { props: { wrapped: wrapped() } })
    try {
      expect(c.find('[data-test="wrapped-slide-intro"]').exists()).toBe(true)
      expect(c.text()).toContain('alice')

      await c.find('[data-test="wrapped-next"]').trigger('click')
      expect(c.find('[data-test="wrapped-slide-totals"]').exists()).toBe(true)
      expect(c.text()).toContain('42')

      await c.find('[data-test="wrapped-next"]').trigger('click')
      expect(c.find('[data-test="wrapped-slide-tiers"]').exists()).toBe(true)

      await c.find('[data-test="wrapped-prev"]').trigger('click')
      expect(c.find('[data-test="wrapped-slide-totals"]').exists()).toBe(true)
    } finally {
      c.unmount()
    }
  })

  it('skips empty slides and ends on the summary', async () => {
    const w = wrapped()
    const c = await mountSuspended(WrappedDeck, { props: { wrapped: w } })
    try {
      // intro, totals, tiers, bestPick, jokers, summary = 6 segments.
      expect(c.findAll('.h-1').length).toBe(6)
      for (let i = 0; i < 5; i++) await c.find('[data-test="wrapped-next"]').trigger('click')
      expect(c.find('[data-test="wrapped-slide-summary"]').exists()).toBe(true)
      // A further tap past the end stays on the summary.
      await c.find('[data-test="wrapped-next"]').trigger('click')
      expect(c.find('[data-test="wrapped-slide-summary"]').exists()).toBe(true)
    } finally {
      c.unmount()
    }
  })

  it('emits close from the close button', async () => {
    const c = await mountSuspended(WrappedDeck, { props: { wrapped: wrapped() } })
    try {
      await c.find('[data-test="wrapped-close"]').trigger('click')
      expect(c.emitted('close')).toBeTruthy()
    } finally {
      c.unmount()
    }
  })
})
