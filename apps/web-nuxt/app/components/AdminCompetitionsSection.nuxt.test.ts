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
  providers: ['fifa', 'uefa', 'espn', 'football-data', 'worldrugby'],
  discoverableProviders: ['espn', 'worldrugby'],
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

// PrimeVue Select renders a combobox overlay rather than a <select>, so the
// tests set the bound value the way the component itself does instead of
// simulating the open-and-click.
const selects = (w: Wrapper) => w.findAllComponents({ name: 'Select' })
type SelectComp = ReturnType<typeof selects>[number]
// Three selects once the add panel is open: default picker, provider, catalog.
// The catalog is always the last one rendered, which survives layout tweaks.
const catalogSelect = (w: Wrapper) => selects(w).at(-1)!
async function pick(sel: ReturnType<typeof catalogSelect>, value: string) {
  // Both events: v-model carries the value, and the catalog clears its probe on
  // `change`.
  sel.vm.$emit('update:modelValue', value)
  sel.vm.$emit('change', { value })
  await nextTick()
}
const buttonWith = (w: Wrapper, text: string) => w.findAll('button').find((b: Found) => b.text().includes(text))!
// The catalog options are in the Select's overlay, unrendered until it opens,
// so the arrival of a catalog is asserted on the picker's options.
const catalogLabels = (w: Wrapper): string[] =>
  ((catalogSelect(w)?.props('options') ?? []) as { label: string }[]).map((o) => o.label)
const awaitCatalog = (w: Wrapper, label: string) =>
  vi.waitFor(() => expect(catalogLabels(w).join(' | ')).toContain(label))

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
    expect(picker.props('modelValue')).toBe('world-cup-2026')
    expect((buttonWith(w, 'Save').element as HTMLButtonElement).disabled).toBe(true)

    await pick(picker, 'euro-2024')
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

    await awaitCatalog(w, 'European Championship')
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/competitions/discover', { params: { provider: 'espn' } })

    await pick(catalogSelect(w), 'uefa.euro')
    await buttonWith(w, 'Check it').trigger('click')

    await vi.waitFor(() => expect(w.text()).toContain('This one works.'))
    expect(w.text()).toContain('51 matches found, 51 usable')

    const slugInput = w.findAll('input')[1]!
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
    await awaitCatalog(w, 'Premier League')

    await pick(catalogSelect(w), 'eng.1')
    await buttonWith(w, 'Check it').trigger('click')

    await vi.waitFor(() => expect(w.text()).toContain("This one can't be added yet."))
    expect(w.text()).toContain('374 matches found, 0 usable')
    expect(w.text()).toContain('this tournament has no groups')
    expect(w.findAll('button').some((b: Found) => b.text() === 'Add it')).toBe(false)
  })

  // Switching provider left the previous catalog on screen, so a World Rugby
  // event could be probed as an ESPN league; switching sub-feed kept the men's
  // list up while every request went to the women's feed.
  it('drops the catalog when the provider or the sub-feed changes', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('FIFA World Cup 2026'))
    await buttonWith(w, 'Add a competition').trigger('click')
    await buttonWith(w, 'List what it carries').trigger('click')
    await awaitCatalog(w, 'European Championship')
    await pick(catalogSelect(w), 'uefa.euro')
    await buttonWith(w, 'Check it').trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('This one works.'))

    const providerSelect = selects(w).find((sel: SelectComp) =>
      ((sel.props('options') ?? []) as { value: string }[]).some((o) => o.value === 'worldrugby'),
    )!
    await pick(providerSelect, 'worldrugby')

    // The list, the choice and the verdict all go: none of them describe the
    // provider now selected.
    await vi.waitFor(() => expect(w.text()).not.toContain('This one works.'))
    expect(w.findAll('button').some((b: Found) => b.text() === 'Add it')).toBe(false)

    // And the sub-feed switch clears it again.
    await buttonWith(w, 'List what it carries').trigger('click')
    await awaitCatalog(w, 'European Championship')
    const feedSelect = selects(w).find((sel: SelectComp) =>
      ((sel.props('options') ?? []) as { value: string }[]).some((o) => o.value === 'wru'),
    )!
    await pick(feedSelect, 'wru')
    // The whole catalog block goes, so there is nothing left to check: asserting
    // on catalogSelect would read the sub-feed picker, the last one standing.
    await vi.waitFor(() => expect(w.findAll('button').some((b: Found) => b.text() === 'Check it')).toBe(false))
    expect(w.text()).not.toContain('of 2 shown')
  })

  // FIFA and UEFA publish no catalog, but probe and create take them like any
  // other provider - the screen used not to offer them at all.
  it('adds a competition from a provider that publishes no catalog', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('FIFA World Cup 2026'))
    await buttonWith(w, 'Add a competition').trigger('click')

    const providerSelect = selects(w).find((sel: SelectComp) =>
      ((sel.props('options') ?? []) as { value: string }[]).some((o) => o.value === 'fifa'),
    )!
    await pick(providerSelect, 'fifa')

    // No catalog to list, so the id is typed in and the same probe judges it.
    expect(w.findAll('button').some((b: Found) => b.text().includes('List what it carries'))).toBe(false)
    await vi.waitFor(() => expect(w.text()).toContain('does not publish a list'))

    const ids = w.findAll('input')
    await ids.at(-2)!.setValue('520')
    await ids.at(-1)!.setValue('2030')
    await buttonWith(w, 'Check it').trigger('click')
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/competitions/probe', {
        params: { provider: 'fifa', externalCompetitionId: '520', seasonHint: '2030' },
      }),
    )
    await vi.waitFor(() => expect(w.text()).toContain('This one works.'))

    await buttonWith(w, 'Add it').trigger('click')
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/competitions', {
        method: 'POST',
        body: { slug: '520-2030', name: '520', provider: 'fifa', externalCompetitionId: '520', seasonHint: '2030' },
      }),
    )
  })

  // ~208 World Rugby events back to 2019, ~218 ESPN leagues: the whole archive
  // is not a menu.
  it('shows recent seasons by default and reveals the rest on request', async () => {
    const old = String(new Date().getFullYear() - 6)
    fetchMock = vi.fn(async (url: string, opts?: Opts) => {
      if (url === '/api/admin/competitions/discover') {
        return {
          competitions: [
            { externalCompetitionId: 'new.1', name: 'This Season', seasonHint: String(new Date().getFullYear()), isTournament: true },
            { externalCompetitionId: 'old.1', name: 'Ancient Cup', seasonHint: old, isTournament: true },
            { externalCompetitionId: 'undated.1', name: 'Undated Cup', seasonHint: null, isTournament: true },
          ],
        }
      }
      if (url === '/api/admin/competitions/probe') return GOOD_PROBE
      return LIST
    })
    vi.stubGlobal('$fetch', fetchMock)

    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('FIFA World Cup 2026'))
    await buttonWith(w, 'Add a competition').trigger('click')
    await buttonWith(w, 'List what it carries').trigger('click')
    await awaitCatalog(w, 'This Season')

    // The old one is out; the undated one cannot be judged old, so it stays.
    expect(catalogLabels(w).join(' | ')).not.toContain('Ancient Cup')
    expect(catalogLabels(w).join(' | ')).toContain('Undated Cup')
    expect(w.text()).toContain('2 of 3 shown')

    await buttonWith(w, 'show 1 older').trigger('click')
    await awaitCatalog(w, 'Ancient Cup')
    expect(w.text()).toContain('3 of 3 shown')
  })

  it('renders nothing for a non-admin', async () => {
    const w = await setup(false)
    expect(w.find('section').exists()).toBe(false)
  })
})

describe('AdminCompetitionsSection error paths', () => {
  // A swallowed server refusal leaves the admin staring at a button that did
  // nothing, which is exactly what the probe gate exists to avoid.
  it('surfaces the server message when creating is refused', async () => {
    fetchMock = vi.fn(async (url: string, opts?: Opts) => {
      if (url === '/api/admin/competitions/discover') return CATALOG
      if (url === '/api/admin/competitions/probe') return GOOD_PROBE
      if (url === '/api/admin/competitions' && opts?.method === 'POST') {
        throw Object.assign(new Error('bad'), { data: { message: 'a competition already uses that slug' } })
      }
      return LIST
    })
    vi.stubGlobal('$fetch', fetchMock)

    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('FIFA World Cup 2026'))
    await buttonWith(w, 'Add a competition').trigger('click')
    await buttonWith(w, 'List what it carries').trigger('click')
    await awaitCatalog(w, 'European Championship')
    await pick(catalogSelect(w), 'uefa.euro')
    await buttonWith(w, 'Check it').trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('This one works.'))

    await buttonWith(w, 'Add it').trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('a competition already uses that slug'))
  })

  it('surfaces a failed discovery', async () => {
    fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/admin/competitions/discover') {
        throw Object.assign(new Error('bad'), { statusMessage: "could not read espn's competition catalog" })
      }
      return LIST
    })
    vi.stubGlobal('$fetch', fetchMock)

    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('FIFA World Cup 2026'))
    await buttonWith(w, 'Add a competition').trigger('click')
    await buttonWith(w, 'List what it carries').trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain("could not read espn's competition catalog"))
  })

  // The slug is permanent, so a collision has to be caught before the click.
  it('blocks create on a slug another competition already holds', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('FIFA World Cup 2026'))
    await buttonWith(w, 'Add a competition').trigger('click')
    await buttonWith(w, 'List what it carries').trigger('click')
    await awaitCatalog(w, 'European Championship')
    await pick(catalogSelect(w), 'uefa.euro')
    await buttonWith(w, 'Check it').trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('This one works.'))

    const slugInput = w.findAll('input')[1]!
    await slugInput.setValue('euro-2024')
    await vi.waitFor(() => expect(w.text()).toContain('Another competition already uses that URL name.'))
    expect((buttonWith(w, 'Add it').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('restores an archived competition', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('Old Cup'))
    await buttonWith(w, 'Restore').trigger('click')
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/competitions/old-cup/active', {
        method: 'PUT',
        body: { isActive: true },
      }),
    )
  })

  // A disabled button shows no native tooltip, so the reason has to be on screen.
  it('says why the current default cannot be archived', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('FIFA World Cup 2026'))
    expect(w.text()).toContain('Pick a different default competition first.')
  })

  describe('a provider that splits its catalog', () => {
    // World Rugby carries men's / women's / age-grade union and sevens as
    // separate catalogs, so the provider alone does not identify a feed.
    beforeEach(() => {
      fetchMock.mockImplementation(async (url: string, opts?: Opts) => {
        if (url === '/api/admin/competitions/discover') return CATALOG
        if (url === '/api/admin/competitions/probe') return GOOD_PROBE
        if (url === '/api/admin/competitions' && opts?.method === 'POST') {
          return { ...LIST.competitions[0], slug: opts.body!.slug }
        }
        return { ...LIST, discoverableProviders: ['espn', 'worldrugby'] }
      })
    })

    it('offers no sub-feed picker for a single-feed provider', async () => {
      const w = await setup(true)
      await vi.waitFor(() => expect(w.text()).toContain('FIFA World Cup 2026'))
      await buttonWith(w, 'Add a competition').trigger('click')
      expect(w.text()).not.toContain('Sub-feed')
    })

    it('picks up the sub-feed and carries it through discover, probe and create', async () => {
      const w = await setup(true)
      await vi.waitFor(() => expect(w.text()).toContain('FIFA World Cup 2026'))
      await buttonWith(w, 'Add a competition').trigger('click')

      const providerSelect = selects(w).find((sel: SelectComp) =>
        ((sel.props('options') ?? []) as { value: string }[]).some((o) => o.value === 'worldrugby'),
      )!
      await pick(providerSelect, 'worldrugby')
      await vi.waitFor(() => expect(w.text()).toContain('Sub-feed'))

      await buttonWith(w, 'List what it carries').trigger('click')
      await vi.waitFor(() =>
        // Defaulted to the men's union feed rather than left blank, so the
        // catalog request is never sent without one.
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/competitions/discover', {
          params: { provider: 'worldrugby', providerSport: 'mru' },
        }),
      )

      // Wait for the catalog to arrive, not just for its request: catalogSelect
      // takes the last picker on the page, which is the sub-feed one until the
      // catalog exists.
      await awaitCatalog(w, 'European Championship')
      await pick(catalogSelect(w), 'uefa.euro')
      await buttonWith(w, 'Check it').trigger('click')
      await vi.waitFor(() => expect(w.text()).toContain('This one works.'))
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/competitions/probe', {
        params: { provider: 'worldrugby', externalCompetitionId: 'uefa.euro', providerSport: 'mru', seasonHint: '2028' },
      })

      await buttonWith(w, 'Add it').trigger('click')
      await vi.waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/competitions', {
          method: 'POST',
          body: expect.objectContaining({ provider: 'worldrugby', providerSport: 'mru' }),
        }),
      )
    })
  })
})
