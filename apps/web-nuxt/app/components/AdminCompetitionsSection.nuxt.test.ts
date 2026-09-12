import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AdminCompetitionsSection from './AdminCompetitionsSection.vue'

const LIST = {
  competitions: [
    { id: 'c1', slug: 'world-cup-2026', name: 'FIFA World Cup 2026', provider: 'fifa', externalCompetitionId: '17', seasonHint: '2026', isActive: true },
    { id: 'c2', slug: 'euro-2024', name: 'UEFA Euro 2024', provider: 'uefa', externalCompetitionId: '3', seasonHint: '2024', isActive: true },
    { id: 'c3', slug: 'old-cup', name: 'Old Cup', provider: 'fifa', externalCompetitionId: '17', seasonHint: '2018', isActive: false },
  ],
  defaultSlug: 'world-cup-2026',
  discoverableProviders: ['espn'],
}

const CATALOG = {
  competitions: [
    { externalCompetitionId: 'eng.1', name: 'Premier League', seasonHint: '2026', isTournament: false },
    { externalCompetitionId: 'uefa.euro', name: 'European Championship', seasonHint: '2028', isTournament: true },
  ],
}

const GOOD_PROBE = {
  fixtures: 51, ingestible: 51, dropped: 0, groups: ['A', 'B'], stages: ['GROUP', 'FINAL'],
  twoLeggedStages: [], hasBracket: true, supported: true, blockers: [],
}
const BAD_PROBE = {
  fixtures: 374, ingestible: 0, dropped: 374, groups: [], stages: ['GROUP'],
  twoLeggedStages: [], hasBracket: false, supported: false, blockers: ['fixtures_dropped'],
}

let fetchMock: ReturnType<typeof vi.fn>

// A boot plugin/layout reads useSession on mount; stub the auth-client surface.
vi.mock('../../lib/auth-client', async () => {
  const { ref } = await import('vue')
  const session = ref({ data: null })
  const authClient = { useSession: () => session, signIn: {}, signUp: {}, signOut: () => {} }
  return { authClient, signIn: authClient.signIn, signUp: authClient.signUp, signOut: authClient.signOut, useSession: authClient.useSession }
})

let wrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null

interface Opts { method?: string; body?: Record<string, unknown>; params?: Record<string, string> }

function stub(probe: unknown = GOOD_PROBE) {
  return vi.fn(async (url: string, opts?: Opts) => {
    if (url === '/api/admin/competitions/discover') return CATALOG
    if (url === '/api/admin/competitions/probe') return probe
    if (url === '/api/admin/competitions/default' && opts?.method === 'PUT') {
      return { defaultSlug: opts.body!.competition }
    }
    if (url === '/api/admin/competitions' && opts?.method === 'POST') return { ...LIST.competitions[0], slug: opts.body!.slug }
    if (url.endsWith('/active') && opts?.method === 'PUT') return { slug: 'euro-2024', isActive: false }
    return LIST
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  fetchMock = stub()
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
})

async function setup(isAdmin = true) {
  wrapper = await mountSuspended(
    defineComponent({
      components: { AdminCompetitionsSection },
      setup() {
        useQueryClient().clear()
      },
      template: `<AdminCompetitionsSection :is-admin="${isAdmin}" />`,
    }),
  )
  return wrapper
}

type Wrapper = NonNullable<typeof wrapper>
type Found = ReturnType<Wrapper['findAll']>[number]

const selects = (w: Wrapper) => w.findAll('select')
// Three selects once the add panel is open: default picker, provider, catalog.
// The catalog is always the last one rendered, which survives layout tweaks.
const catalogSelect = (w: Wrapper) => selects(w).at(-1)!
const buttonWith = (w: Wrapper, text: string) => w.findAll('button').find((b: Found) => b.text().includes(text))!

describe('AdminCompetitionsSection', () => {
  it('lists every competition including archived ones, and marks the default', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('FIFA World Cup 2026'))
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/competitions')
    // The archived row is the one the public list would not show.
    expect(w.text()).toContain('Old Cup')
    expect(w.text()).toContain('fifa / 17 / 2026')
  })

  it('seeds the default picker and saves only once it moves', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(selects(w).length).toBeGreaterThan(0))
    const picker = selects(w)[0]!
    expect((picker.element as HTMLSelectElement).value).toBe('world-cup-2026')
    expect((buttonWith(w, 'Save').element as HTMLButtonElement).disabled).toBe(true)

    await picker.setValue('euro-2024')
    await buttonWith(w, 'Save').trigger('click')
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/competitions/default', {
        method: 'PUT',
        body: { competition: 'euro-2024' },
      }),
    )
  })

  it('archives a competition, but never the current default', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('UEFA Euro 2024'))
    const archiveButtons = w.findAll('button').filter((b: Found) => b.text() === 'Archive')
    // Two active competitions, but the default's own Archive is disabled.
    expect(archiveButtons).toHaveLength(2)
    expect((archiveButtons[0]!.element as HTMLButtonElement).disabled).toBe(true)

    await archiveButtons[1]!.trigger('click')
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/competitions/euro-2024/active', {
        method: 'PUT',
        body: { isActive: false },
      }),
    )
  })

  it('walks discover -> probe -> create, suggesting a slug from the chosen name', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('FIFA World Cup 2026'))
    await buttonWith(w, 'Add a competition').trigger('click')
    await buttonWith(w, 'List what it carries').trigger('click')

    await vi.waitFor(() => expect(w.text()).toContain('European Championship'))
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/competitions/discover', { params: { provider: 'espn' } })

    await catalogSelect(w).setValue('uefa.euro')
    await buttonWith(w, 'Check it').trigger('click')

    await vi.waitFor(() => expect(w.text()).toContain('This one works.'))
    expect(w.text()).toContain('51 matches found, 51 usable')

    const slugInput = w.findAll('input[type="text"]')[1]!
    expect((slugInput.element as HTMLInputElement).value).toBe('european-championship-2028')

    await buttonWith(w, 'Add it').trigger('click')
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/competitions', {
        method: 'POST',
        body: {
          slug: 'european-championship-2028',
          name: 'European Championship',
          provider: 'espn',
          externalCompetitionId: 'uefa.euro',
          seasonHint: '2028',
        },
      }),
    )
  })

  // The point of the probe: a competition the app would silently fail to ingest
  // must explain itself and must not offer a create button at all.
  it('refuses an unsupported competition and says why', async () => {
    fetchMock = stub(BAD_PROBE)
    vi.stubGlobal('$fetch', fetchMock)
    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('FIFA World Cup 2026'))
    await buttonWith(w, 'Add a competition').trigger('click')
    await buttonWith(w, 'List what it carries').trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('Premier League'))

    await catalogSelect(w).setValue('eng.1')
    await buttonWith(w, 'Check it').trigger('click')

    await vi.waitFor(() => expect(w.text()).toContain("This one can't be added yet."))
    expect(w.text()).toContain('374 matches found, 0 usable')
    expect(w.text()).toContain('this tournament has no groups')
    expect(w.findAll('button').some((b: Found) => b.text() === 'Add it')).toBe(false)
  })

  it('renders nothing for a non-admin', async () => {
    const w = await setup(false)
    expect(w.find('section').exists()).toBe(false)
  })
})
