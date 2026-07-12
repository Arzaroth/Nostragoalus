import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import H2HReport from './H2HReport.vue'
import type { H2HResponse } from '#shared/types/h2h'

const DATA: H2HResponse = {
  competitionName: 'World Cup',
  a: { id: 'a', name: 'Alice', image: null },
  b: { id: 'b', name: 'Bob', image: null },
  shared: 5,
  hasData: true,
  aPoints: 18,
  bPoints: 12,
  aWins: 3,
  bWins: 1,
  ties: 1,
  agreement: { sameScore: 2, sameOutcome: 4 },
  overTime: [
    { label: 'Group 1', order: 1, aPoints: 8, bPoints: 5 },
    { label: 'Group 2', order: 2, aPoints: 18, bPoints: 12 },
  ],
  divergences: [
    { matchId: 'm1', home: 'France', away: 'Brazil', homeCode: 'FRA', awayCode: 'BRA', actual: '2-0', aPredicted: '2-0', bPredicted: '0-1', aPoints: 5, bPoints: 0, winner: 'a', diverged: true },
  ],
}

let wrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

async function mount(over: Partial<H2HResponse> = {}) {
  wrapper = await mountSuspended(H2HReport, { props: { data: { ...DATA, ...over } } })
  return wrapper
}

describe('H2HReport', () => {
  it('shows both players, their totals and the match record', async () => {
    const w = await mount()
    expect(w.text()).toContain('Alice')
    expect(w.text()).toContain('Bob')
    expect(w.text()).toContain('18')
    expect(w.text()).toContain('12')
    expect(w.text()).toContain('3-1-1')
  })

  it('reports pick agreement counts', async () => {
    const w = await mount()
    expect(w.text()).toContain('same score')
    expect(w.text()).toContain('same outcome')
  })

  it('draws the two-series lead chart with a hover band per round', async () => {
    const w = await mount()
    expect(w.text()).toContain('Lead over time')
    expect(w.findAll('svg polyline')).toHaveLength(2)
    expect(w.findAll('svg rect')).toHaveLength(2)
  })

  it('hides the lead chart until there is more than one round', async () => {
    const w = await mount({ overTime: [{ label: 'Group 1', order: 1, aPoints: 8, bPoints: 5 }] })
    expect(w.find('svg polyline').exists()).toBe(false)
  })

  it('lists the biggest divergences', async () => {
    const w = await mount()
    const items = w.find('[data-test="h2h-divergences"]').findAll('li')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('France')
    expect(items[0].text()).toContain('2-0')
    expect(items[0].text()).toContain('0-1')
  })
})
