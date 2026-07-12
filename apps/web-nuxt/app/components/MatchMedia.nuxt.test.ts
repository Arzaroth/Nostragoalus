import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQueryClient } from '@tanstack/vue-query'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MatchMedia from './MatchMedia.vue'

type Item = { id: string; kind: string; url: string; label: string | null; embeddable: boolean; sandbox?: boolean | null; allow?: string | null }

function stubFetch(media: Item[], isAdmin: boolean) {
  return vi.fn(async (url: string, opts?: { method?: string }) => {
    if (url.endsWith('/media') && opts?.method === 'POST') return { id: 'new' }
    if (url.includes('/admin/status')) return { isAdmin }
    if (url.endsWith('/media')) return { media }
    return { ok: true }
  })
}

// The vue-query client is a shared singleton across mounts; wipe it between
// tests so a prior admin-status / media result can't leak (60s staleTime), and
// unmount the component so its observers don't bleed into the next test.
let qc: ReturnType<typeof useQueryClient>
let wrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null
beforeEach(async () => {
  await mountSuspended({ setup() { qc = useQueryClient(); return () => null } })
  qc.clear()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
})

// MatchMedia is now the admin management panel only - the watch area itself
// lives in the match-view tabs (see MatchMediaEmbed).
describe('MatchMedia (admin panel)', () => {
  it('renders nothing for a guest', async () => {
    vi.stubGlobal('$fetch', stubFetch([{ id: 'l1', kind: 'LIVE', url: 'https://youtu.be/x', label: null, embeddable: true }], false))
    wrapper = await mountSuspended(MatchMedia, { props: { matchId: 'm1' } })
    await new Promise((r) => setTimeout(r, 50))
    expect(wrapper.find('section').exists()).toBe(false)
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('lets an admin add and remove links', async () => {
    const fetchMock = stubFetch([{ id: 'l1', kind: 'LIVE', url: 'https://youtu.be/x', label: null, embeddable: true }], true)
    vi.stubGlobal('$fetch', fetchMock)
    wrapper = await mountSuspended(MatchMedia, { props: { matchId: 'm1' } })
    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))

    // Remove the existing link.
    await wrapper.find('button[aria-label="Remove"]').trigger('click')
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/matches/m1/media/l1', expect.objectContaining({ method: 'DELETE' }))

    // Add a new one (the URL field also accepts a pasted iframe tag, so it is a
    // text input now - target it by its aria-label).
    await wrapper.find('input[aria-label="URL"]').setValue('https://youtu.be/new1')
    await wrapper.find('form').trigger('submit')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/matches/m1/media',
      expect.objectContaining({ method: 'POST', body: expect.objectContaining({ kind: 'LIVE', url: 'https://youtu.be/new1', embeddable: null }) }),
    )
  })

  it('extracts a pasted iframe tag and forwards the sandbox-off override', async () => {
    const fetchMock = stubFetch([], true)
    vi.stubGlobal('$fetch', fetchMock)
    wrapper = await mountSuspended(MatchMedia, { props: { matchId: 'm1' } })
    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))

    // Paste a provider's iframe tag: the URL field keeps just the src + allow.
    await wrapper.find('input[aria-label="URL"]').setValue('<iframe src="https://ppv.example/embed/x" allow="autoplay; encrypted-media"></iframe>')
    await wrapper.find('select[aria-label="Sandbox"]').setValue('off')
    await wrapper.find('form').trigger('submit')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/matches/m1/media',
      expect.objectContaining({ method: 'POST', body: expect.objectContaining({ url: 'https://ppv.example/embed/x', sandbox: false, allow: 'autoplay; encrypted-media' }) }),
    )
  })
})
