import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MatchViewers from './MatchViewers.vue'

describe('MatchViewers', () => {
  it('renders the singular count', async () => {
    const c = await mountSuspended(MatchViewers, { props: { count: 1 } })
    expect(c.text()).toContain('1 watching now')
  })

  it('renders the plural count', async () => {
    const c = await mountSuspended(MatchViewers, { props: { count: 12 } })
    expect(c.text()).toContain('12 watching now')
  })
})
