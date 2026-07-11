import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AnalyticsReport from './AnalyticsReport.vue'
import type { AnalyticsResponse } from '#shared/types/analytics'

const DATA: AnalyticsResponse = {
  competitionName: 'World Cup',
  hasData: true,
  totalPicks: 10,
  totalPoints: 24,
  avgPoints: 2.4,
  tiers: { exact: 3, diff: 2, outcome: 2, miss: 3 },
  accuracy: 0.7,
  exactRate: 0.3,
  goals: { predictedAvg: 3.1, actualAvg: 2.2, lean: 0.9 },
  outcomeLean: {
    predicted: { home: 7, draw: 0, away: 3 },
    actual: { home: 4, draw: 3, away: 3 },
    homeBiasPct: 30,
    drawGapPct: -30,
  },
  teams: {
    overrated: [{ code: 'FRA', name: 'France', sample: 3, predictedWinRate: 1, actualWinRate: 0.33, delta: 0.67 }],
    underrated: [{ code: 'BRA', name: 'Brazil', sample: 3, predictedWinRate: 0, actualWinRate: 0.67, delta: -0.67 }],
  },
  overTime: [
    { label: 'Group 1', order: 1, picks: 3, accuracy: 0.67, points: 9 },
    { label: 'Group 2', order: 2, picks: 3, accuracy: 0.33, points: 4 },
  ],
  streak: { current: 2, best: 4 },
  bestCall: { home: 'France', away: 'Brazil', homeCode: 'FRA', awayCode: 'BRA', predicted: '2-0', actual: '2-0', points: 8, tier: 'exact', isJoker: true },
  worstMiss: { home: 'Spain', away: 'Italy', homeCode: 'ESP', awayCode: 'ITA', predicted: '0-0', actual: '3-3', points: 0, tier: 'miss', isJoker: false },
  fergieTime: {
    matches: 2,
    goals: 3,
    netPoints: 1,
    pointsWon: 3,
    pointsLost: 2,
    biggestGain: { home: 'France', away: 'Brazil', homeCode: 'FRA', awayCode: 'BRA', predicted: '2-1', actual: '2-1', gained: 3, lost: 0, net: 3, isJoker: false },
    biggestLoss: { home: 'Spain', away: 'Italy', homeCode: 'ESP', awayCode: 'ITA', predicted: '1-1', actual: '1-2', gained: 0, lost: 2, net: -2, isJoker: false },
    breakdown: [
      { home: 'France', away: 'Brazil', homeCode: 'FRA', awayCode: 'BRA', predicted: '2-1', actual: '2-1', gained: 3, lost: 0, net: 3, isJoker: false },
      { home: 'Spain', away: 'Italy', homeCode: 'ESP', awayCode: 'ITA', predicted: '1-1', actual: '1-2', gained: 0, lost: 2, net: -2, isJoker: false },
    ],
  },
}

let wrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

async function mount(over: Partial<AnalyticsResponse> = {}) {
  wrapper = await mountSuspended(AnalyticsReport, { props: { data: { ...DATA, ...over } } })
  return wrapper
}

describe('AnalyticsReport', () => {
  it('shows the summary totals', async () => {
    const w = await mount()
    expect(w.text()).toContain('10')
    expect(w.text()).toContain('24')
    expect(w.text()).toContain('2.4')
    expect(w.text()).toContain('70%')
  })

  it('calls out over-prediction of goals when the lean is positive', async () => {
    const w = await mount()
    expect(w.text()).toContain('You over-egg the goals.')
  })

  it('reports a tighter reader when the lean is negative', async () => {
    const w = await mount({ goals: { predictedAvg: 1.2, actualAvg: 2.5, lean: -1.3 } })
    expect(w.text()).toContain('tighter')
  })

  it('flags home bias and draw-blindness with signed points', async () => {
    const w = await mount()
    expect(w.text()).toContain('Home bias +30 pts')
    expect(w.text()).toContain('Draw-blind -30 pts')
  })

  it('lists over- and under-rated teams with their flags', async () => {
    const w = await mount()
    expect(w.text()).toContain('France')
    expect(w.text()).toContain('Brazil')
    expect(w.find('img[src*="FRA"]').exists()).toBe(true)
    expect(w.find('img[src*="BRA"]').exists()).toBe(true)
  })

  it('renders the accuracy sparkline with one hover band per round', async () => {
    const w = await mount()
    expect(w.text()).toContain('Accuracy by round')
    expect(w.find('svg polyline').exists()).toBe(true)
    // One transparent hit rect per round carries the tooltip.
    expect(w.findAll('svg rect')).toHaveLength(2)
  })

  it('hides the sparkline until there is more than one round', async () => {
    const w = await mount({ overTime: [{ label: 'Group 1', order: 1, picks: 3, accuracy: 0.67, points: 9 }] })
    expect(w.find('svg polyline').exists()).toBe(false)
  })

  it('shows the current streak and best run when a run exists', async () => {
    const w = await mount()
    expect(w.text()).toContain('current streak')
    expect(w.text()).toContain('Best run: 4')
  })

  it('hides the streak card when the best run is zero', async () => {
    const w = await mount({ streak: { current: 0, best: 0 } })
    expect(w.text()).not.toContain('current streak')
  })

  it('shows the best call and biggest miss', async () => {
    const w = await mount()
    expect(w.text()).toContain('Best call')
    expect(w.text()).toContain('2-0')
    expect(w.text()).toContain('Biggest miss')
    expect(w.text()).toContain('3-3')
  })

  it('omits the biggest-miss card when there is none', async () => {
    const w = await mount({ worstMiss: null })
    expect(w.text()).not.toContain('Biggest miss')
  })

  it('shows the fergie-time card with the signed net and the won/lost split', async () => {
    const w = await mount()
    expect(w.text()).toContain('Fergie time')
    expect(w.find('[data-test="fergie-net"]').text()).toBe('+1')
    expect(w.text()).toContain('+3 won')
    expect(w.text()).toContain('-2 lost')
  })

  it('lists every match with added-time point movement in the breakdown', async () => {
    const w = await mount()
    const items = w.find('[data-test="fergie-breakdown"]').findAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('France')
    expect(items[0].text()).toContain('(+3)')
    expect(items[1].text()).toContain('(-2)')
  })

  it('hides the fergie-time card when no pick had an added-time goal', async () => {
    const w = await mount({
      fergieTime: { matches: 0, goals: 0, netPoints: 0, pointsWon: 0, pointsLost: 0, biggestGain: null, biggestLoss: null, breakdown: [] },
    })
    expect(w.find('[data-test="fergie-time"]').exists()).toBe(false)
  })
})
