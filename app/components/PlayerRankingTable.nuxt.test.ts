import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
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
})
