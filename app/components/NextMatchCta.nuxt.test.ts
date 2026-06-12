import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import NextMatchCta from './NextMatchCta.vue'

// Real refs the tests can mutate (the route/auth sources don't resolve in the
// harness) - same pattern as useCrowdTotals.nuxt.test.ts.
vi.mock('../composables/useAuth', async () => {
  const { ref } = await import('vue')
  const authed = ref(true)
  return { useAuth: () => ({ session: ref(authed.value ? { data: { user: { id: 'u1' } } } : { data: null }) }), __authed: authed }
})

const FUTURE = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString()

const MATCHES = [
  { id: 'm-done', status: 'FINISHED', kickoffTime: PAST, homeTeam: 'Qatar', awayTeam: 'Ecuador', homeTeamCode: 'QAT', awayTeamCode: 'ECU' },
  { id: 'm-next', status: 'SCHEDULED', kickoffTime: FUTURE, homeTeam: 'France', awayTeam: 'Brazil', homeTeamCode: 'FRA', awayTeamCode: 'BRA' },
]

let mounted: Array<{ unmount: () => void }> = []
beforeEach(() => {
  sessionStorage.clear()
  vi.stubGlobal('$fetch', vi.fn(async () => ({ matches: MATCHES })))
})
afterEach(async () => {
  for (const w of mounted) w.unmount()
  mounted = []
  vi.unstubAllGlobals()
  const mod = (await import('../composables/useAuth')) as any
  mod.__authed.value = true
})

async function setup() {
  const wrapper = await mountSuspended(NextMatchCta)
  mounted.push(wrapper)
  return wrapper
}

describe('NextMatchCta', () => {
  it('shows the next scheduled match with both teams', async () => {
    const c = await setup()
    await vi.waitFor(() => expect(c.text()).toContain('France'))
    expect(c.text()).toContain('Brazil')
    expect(c.text()).toContain('Next match')
  })

  it('renders nothing when signed out', async () => {
    const mod = (await import('../composables/useAuth')) as any
    mod.__authed.value = false
    const c = await setup()
    await new Promise((r) => setTimeout(r, 20))
    expect(c.text().trim()).toBe('')
  })

  it('stays hidden for a match dismissed earlier this session', async () => {
    sessionStorage.setItem('ng-next-cta-dismissed', 'm-next')
    const c = await setup()
    await new Promise((r) => setTimeout(r, 20))
    expect(c.text().trim()).toBe('')
  })
})
