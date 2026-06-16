import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StandingsTable from './StandingsTable.vue'
import type { StandingRow } from '../../server/utils/stats/standings'

const ROWS: StandingRow[] = [
  { code: 'BRA', name: 'Brazil', played: 3, won: 3, drawn: 0, lost: 0, gf: 7, ga: 1, gd: 6, points: 9 },
  { code: null, name: 'To be decided', played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 },
]

let wrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('StandingsTable', () => {
  it('renders ranked rows with the +GD sign and links coded teams with a flag', async () => {
    wrapper = await mountSuspended(StandingsTable, { props: { rows: ROWS, slug: 'wc', highlight: ['BRA'] } })

    const text = wrapper.text()
    expect(text).toContain('Brazil')
    expect(text).toContain('To be decided')
    expect(text).toContain('+6') // positive GD carries a leading +

    // slug + code -> team link with a flag; first row only.
    expect(wrapper.find('a[href="/wc/teams/BRA"]').exists()).toBe(true)
    expect(wrapper.find('img[src*="BRA"]').exists()).toBe(true)
  })

  it('renders a null-code team as plain text (no link, no flag)', async () => {
    wrapper = await mountSuspended(StandingsTable, { props: { rows: ROWS, slug: 'wc', highlight: ['BRA'] } })

    // The second row (null code) is a span, not a link, and has no flag image.
    expect(wrapper.findAll('a').length).toBe(1) // only Brazil links
    expect(wrapper.findAll('tbody tr')[1].find('img').exists()).toBe(false)
  })

  it('omits team links entirely when no slug is given (match-agnostic use)', async () => {
    wrapper = await mountSuspended(StandingsTable, { props: { rows: ROWS } })
    expect(wrapper.findAll('a').length).toBe(0)
  })
})
