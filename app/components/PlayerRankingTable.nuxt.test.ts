import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { DOMWrapper } from '@vue/test-utils'
import PlayerRankingTable from './PlayerRankingTable.vue'
import type { TopScorer } from '#shared/types/match'

const ROWS: TopScorer[] = [
  { playerName: 'Kylian Mbappe', teamName: 'France', teamCode: 'FRA', goals: 5, assists: 1, penalties: null },
  { playerName: 'Jamal Musiala', teamName: 'Germany', teamCode: 'GER', goals: 1, assists: 4, penalties: null },
  { playerName: 'Bench Warmer', teamName: 'Spain', teamCode: 'ESP', goals: 0, assists: 0, penalties: null },
]

let wrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('PlayerRankingTable', () => {
  it('ranks by goals, drops zero-goal rows, and shows team flags', async () => {
    wrapper = await mountSuspended(PlayerRankingTable, { props: { rows: ROWS, metric: 'goals' } })

    const body = wrapper.findAll('tbody tr')
    expect(body.length).toBe(2) // Bench Warmer (0 goals) excluded
    expect(body[0].text()).toContain('Mbappe') // 5 goals leads
    expect(body[0].text()).toContain('5')
    expect(body[1].text()).toContain('Musiala')
    expect(wrapper.find('img[src*="FRA"]').exists()).toBe(true)
  })

  it('re-ranks the same set by assists', async () => {
    wrapper = await mountSuspended(PlayerRankingTable, { props: { rows: ROWS, metric: 'assists' } })

    const body = wrapper.findAll('tbody tr')
    expect(body.length).toBe(2)
    expect(body[0].text()).toContain('Musiala') // 4 assists leads
    expect(body[0].text()).toContain('4')
    expect(body[1].text()).toContain('Mbappe')
  })

  it('respects the limit prop', async () => {
    wrapper = await mountSuspended(PlayerRankingTable, { props: { rows: ROWS, metric: 'goals', limit: 1 } })
    expect(wrapper.findAll('tbody tr').length).toBe(1)
  })

  it('renders an empty-state row when no one qualifies', async () => {
    wrapper = await mountSuspended(PlayerRankingTable, { props: { rows: [], metric: 'goals' } })
    const body = wrapper.findAll('tbody tr')
    expect(body.length).toBe(1)
    expect(body[0].find('td[colspan="3"]').exists()).toBe(true)
  })

  it('omits the flag for a null teamCode and treats null assists as zero', async () => {
    const rows: TopScorer[] = [
      { playerName: 'No Flag', teamName: '', teamCode: null, goals: 2, assists: null, penalties: null },
    ]
    wrapper = await mountSuspended(PlayerRankingTable, { props: { rows, metric: 'goals' } })
    expect(wrapper.findAll('tbody tr').length).toBe(1) // 2 goals qualifies
    expect(wrapper.find('tbody img').exists()).toBe(false) // no flag without a teamCode

    wrapper.unmount()
    wrapper = await mountSuspended(PlayerRankingTable, { props: { rows, metric: 'assists' } })
    // null assists coalesces to 0, so the row drops and the empty state shows
    expect(wrapper.find('td[colspan="3"]').exists()).toBe(true)
  })

  it('breaks goal ties by assists then name, matching the endpoint order', async () => {
    const tied: TopScorer[] = [
      { playerName: 'Zeta Striker', teamName: 'A', teamCode: 'AAA', goals: 3, assists: 0, penalties: null },
      { playerName: 'Alpha Striker', teamName: 'B', teamCode: 'BBB', goals: 3, assists: 2, penalties: null },
    ]
    wrapper = await mountSuspended(PlayerRankingTable, { props: { rows: tied, metric: 'goals' } })
    const body = wrapper.findAll('tbody tr')
    // Alpha has more assists, so it leads despite the later name.
    expect(body[0].text()).toContain('Alpha')
    expect(body[1].text()).toContain('Zeta')
  })

  it('shares the rank for players level on the metric and skips after a tie', async () => {
    const rows: TopScorer[] = [
      { playerName: 'Lead', teamName: 'A', teamCode: 'AAA', goals: 6, assists: 0, penalties: null },
      { playerName: 'Tie One', teamName: 'B', teamCode: 'BBB', goals: 4, assists: 2, penalties: null },
      { playerName: 'Tie Two', teamName: 'C', teamCode: 'CCC', goals: 4, assists: 1, penalties: null },
      { playerName: 'Tie Three', teamName: 'D', teamCode: 'DDD', goals: 4, assists: 0, penalties: null },
      { playerName: 'Trailer', teamName: 'E', teamCode: 'EEE', goals: 3, assists: 0, penalties: null },
    ]
    wrapper = await mountSuspended(PlayerRankingTable, { props: { rows, metric: 'goals' } })
    // Drop the header row; the first cell of each body row is the rank:
    // 1, then joint-2nd x3, then 5th.
    const ranks = wrapper.findAll('tr').slice(1).map((tr: DOMWrapper<Element>) => tr.findAll('td')[0].text())
    expect(ranks).toEqual(['1', '2', '2', '2', '5'])
  })
})
