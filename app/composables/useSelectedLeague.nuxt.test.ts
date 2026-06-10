import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useLeagueSelections, useSelectedLeague } from './useSelectedLeague'

// Drive the competition directly (same trick as useCrowdTotals.nuxt.test.ts:
// the harness can't resolve file-route params, so the slug source is a ref).
vi.mock('./useCompetitions', async () => {
  const { ref } = await import('vue')
  const slug = ref('world-cup-2026')
  return { useSelectedCompetition: () => slug, __slug: slug }
})
vi.mock('./useAuth', async () => {
  const { ref } = await import('vue')
  const session = ref<{ data: { user: { id: string } } } | { data: null }>({ data: { user: { id: 'u1' } } })
  return { useAuth: () => ({ session }), __session: session }
})

async function setSlug(v: string) {
  ;((await import('./useCompetitions')) as any).__slug.value = v
}

const LEAGUES: Record<string, Array<{ id: string; name: string; competition: { slug: string } }>> = {}
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await setSlug('world-cup-2026')
  fetchMock = vi.fn(async (_url: string, opts: any) => ({
    leagues: LEAGUES[opts?.query?.competition as string] ?? [],
  }))
  vi.stubGlobal('$fetch', fetchMock)
  LEAGUES['world-cup-2026'] = [{ id: 'l1', name: 'Bureau', competition: { slug: 'world-cup-2026' } }]
  LEAGUES['euro-2024'] = [{ id: 'l2', name: 'Euro crew', competition: { slug: 'euro-2024' } }]
})
afterEach(() => vi.unstubAllGlobals())

async function setup() {
  let api!: ReturnType<typeof useSelectedLeague>
  let selections!: ReturnType<typeof useLeagueSelections>
  await mountSuspended({
    setup() {
      selections = useLeagueSelections()
      api = useSelectedLeague()
      return () => null
    },
  })
  return { api, selections }
}

describe('useSelectedLeague', () => {
  it('reads and writes the per-competition selection', async () => {
    const { api, selections } = await setup()
    expect(api.leagueId.value).toBeNull()
    api.leagueId.value = 'l1'
    expect(selections.value).toEqual({ 'world-cup-2026': 'l1' })
    await vi.waitFor(() => expect(api.league.value?.name).toBe('Bureau'))

    await setSlug('euro-2024')
    expect(api.leagueId.value).toBeNull()
    api.leagueId.value = 'l2'
    expect(selections.value).toEqual({ 'world-cup-2026': 'l1', 'euro-2024': 'l2' })

    await setSlug('world-cup-2026')
    expect(api.leagueId.value).toBe('l1')
    api.leagueId.value = null
    expect(selections.value).toEqual({ 'euro-2024': 'l2' })
  })

  it('prunes a stored selection the user no longer has', async () => {
    LEAGUES['world-cup-2026'] = []
    const { api, selections } = await setup()
    selections.value = { 'world-cup-2026': 'gone', 'euro-2024': 'l2' }
    await vi.waitFor(() => expect(api.leagueId.value).toBeNull())
    // Other competitions are left alone until visited.
    expect(selections.value).toEqual({ 'euro-2024': 'l2' })
  })

  it('keeps a valid selection after the leagues load', async () => {
    const { api, selections } = await setup()
    selections.value = { 'world-cup-2026': 'l1' }
    await vi.waitFor(() => expect(api.league.value?.id).toBe('l1'))
    expect(selections.value).toEqual({ 'world-cup-2026': 'l1' })
  })
})
