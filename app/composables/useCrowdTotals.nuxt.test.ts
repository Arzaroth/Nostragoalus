import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useCrowdTotals } from './useCrowdTotals'

// Drive the competition directly (the real source is the reactive route param;
// the test harness can't resolve file-route params, so we mock the slug source
// with a real ref the test can mutate).
vi.mock('./useCompetitions', async () => {
  const { ref } = await import('vue')
  const slug = ref('world-cup-2026')
  return { useSelectedCompetition: () => slug, __slug: slug }
})
vi.mock('./useAuth', async () => {
  const { ref } = await import('vue')
  const showCrowd = ref(true)
  return { useAuth: () => ({ session: ref({ data: { user: { showCrowd: showCrowd.value } } }) }), __showCrowd: showCrowd }
})
vi.mock('./useSelectedLeague', async () => {
  const { ref } = await import('vue')
  const leagueId = ref<string | null>(null)
  return { useSelectedLeague: () => ({ leagueId }), __leagueId: leagueId }
})

async function setSlug(v: string) {
  const mod = (await import('./useCompetitions')) as any
  mod.__slug.value = v
}

async function setShowCrowd(v: boolean) {
  const mod = (await import('./useAuth')) as any
  mod.__showCrowd.value = v
}

async function setLeague(v: string | null) {
  const mod = (await import('./useSelectedLeague')) as any
  mod.__leagueId.value = v
}

const COUNT: Record<string, number> = { 'world-cup-2026': 26, 'euro-2024': 24 }
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(async () => {
  await setSlug('world-cup-2026')
  await setShowCrowd(true)
  await setLeague(null)
  fetchMock = vi.fn(async (_url: string, opts: any) => {
    if (opts?.query?.league) {
      return { totals: { m1: { home: 2, away: 0, count: 3 } }, league: { id: opts.query.league, name: 'L' } }
    }
    return { totals: { m1: { home: 1, away: 1, count: COUNT[opts?.query?.competition as string] ?? 0 } } }
  })
  vi.stubGlobal('$fetch', fetchMock)
})
// Unmount between tests: a leaked component keeps its query observer alive,
// and the next test's beforeEach slug reset makes it refetch into that test's
// fresh fetch mock (flaked under parallel load once the suite grew).
let mounted: Array<{ unmount: () => void }> = []
afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
  vi.unstubAllGlobals()
})

async function setup() {
  let api!: ReturnType<typeof useCrowdTotals>
  const wrapper = await mountSuspended({ setup() { api = useCrowdTotals(); return () => null } })
  mounted.push(wrapper)
  return api
}

describe('useCrowdTotals', () => {
  it('loads the current competition, then refetches when it changes', async () => {
    const api = await setup()
    await vi.waitFor(() => expect(api.totals.value.m1?.count).toBe(26))

    await setSlug('euro-2024')
    await vi.waitFor(() => expect(api.totals.value.m1?.count).toBe(24))
    expect(fetchMock).toHaveBeenCalledWith('/api/predictions/crowd', expect.objectContaining({ query: { competition: 'euro-2024' } }))
  })

  it('returns nothing while the preference is off', async () => {
    await setShowCrowd(false)
    const api = await setup()
    await new Promise((r) => setTimeout(r, 20))
    expect(api.totals.value).toEqual({})
    expect(fetchMock).not.toHaveBeenCalledWith('/api/predictions/crowd', expect.anything())
  })

  it('fetches league totals when a league is selected and clears them when unselected', async () => {
    const api = await setup()
    await vi.waitFor(() => expect(api.totals.value.m1?.count).toBe(26))
    expect(api.leagueActive.value).toBe(false)
    expect(api.leagueTotals.value).toEqual({})

    await setLeague('l1')
    await vi.waitFor(() => expect(api.leagueTotals.value.m1?.count).toBe(3))
    expect(api.leagueActive.value).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/predictions/crowd', expect.objectContaining({ query: { league: 'l1' } }))
    // Global totals are untouched by the league fetch.
    expect(api.totals.value.m1?.count).toBe(26)

    await setLeague(null)
    await vi.waitFor(() => expect(api.leagueTotals.value).toEqual({}))
    expect(api.leagueActive.value).toBe(false)
  })
})
