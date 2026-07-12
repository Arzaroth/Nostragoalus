import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import Countdown from './Countdown.vue'

describe('Countdown (harness smoke test)', () => {
  it('renders a future kickoff as a countdown', async () => {
    const future = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString()
    const c = await mountSuspended(Countdown, { props: { to: future } })
    expect(c.text()).toMatch(/\d/)
  })

  it('renders nothing for a match far in the past', async () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const c = await mountSuspended(Countdown, { props: { to: past } })
    expect(c.text().trim()).toBe('')
  })
})
