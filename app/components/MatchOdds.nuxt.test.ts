import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MatchOdds from './MatchOdds.vue'

describe('MatchOdds', () => {
  it('renders the three decimal prices with two decimals', async () => {
    const wrapper = await mountSuspended(MatchOdds, { props: { odds: { home: 2.1, draw: 3.4, away: 3.625 } } })
    const text = wrapper.text().replace(/\s+/g, ' ')
    expect(text).toContain('1 2.10')
    expect(text).toContain('X 3.40')
    expect(text).toContain('2 3.63')
  })

  it('renders nothing without odds', async () => {
    const wrapper = await mountSuspended(MatchOdds, { props: { odds: null } })
    expect(wrapper.text().trim()).toBe('')
  })
})
