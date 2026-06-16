import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQueryClient } from '@tanstack/vue-query'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MatchMedia from './MatchMedia.vue'

type Item = { id: string; kind: string; url: string; label: string | null; embeddable: boolean }

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

describe('MatchMedia', () => {
  it('embeds a finished-match replay and hides LIVE; no admin panel for guests', async () => {
    vi.stubGlobal('$fetch', stubFetch(
      [
        { id: 'r1', kind: 'REPLAY', url: 'https://youtu.be/rep1', label: null, embeddable: true },
        { id: 'l1', kind: 'LIVE', url: 'https://grey.example/live', label: null, embeddable: false },
      ],
      false,
    ))
    wrapper = await mountSuspended(MatchMedia, { props: { matchId: 'm1', status: 'FINISHED' } })
    await vi.waitFor(() => expect(wrapper.find('iframe').exists()).toBe(true))

    expect(wrapper.find('iframe').attributes('src')).toBe('https://www.youtube-nocookie.com/embed/rep1')
    // LIVE is filtered out once finished; no admin form for a guest.
    expect(wrapper.html()).not.toContain('grey.example/live')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('shows an external watch button for a non-embeddable live link', async () => {
    vi.stubGlobal('$fetch', stubFetch(
      [{ id: 'l1', kind: 'LIVE', url: 'https://grey.example/live', label: 'Mirror', embeddable: false }],
      false,
    ))
    wrapper = await mountSuspended(MatchMedia, { props: { matchId: 'm1', status: 'SCHEDULED' } })
    await vi.waitFor(() => expect(wrapper.find('a[href="https://grey.example/live"]').exists()).toBe(true))

    const link = wrapper.find('a[href="https://grey.example/live"]')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
    expect(link.text()).toContain('Mirror')
    expect(wrapper.find('iframe').exists()).toBe(false)
  })

  it('lets an admin add and remove links', async () => {
    const fetchMock = stubFetch(
      [{ id: 'l1', kind: 'LIVE', url: 'https://youtu.be/x', label: null, embeddable: true }],
      true,
    )
    vi.stubGlobal('$fetch', fetchMock)
    wrapper = await mountSuspended(MatchMedia, { props: { matchId: 'm1', status: 'SCHEDULED' } })
    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))

    // Remove the existing link.
    await wrapper.find('button[aria-label="Remove"]').trigger('click')
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/matches/m1/media/l1', expect.objectContaining({ method: 'DELETE' }))

    // Add a new one.
    await wrapper.find('input[type="url"]').setValue('https://youtu.be/new1')
    await wrapper.find('form').trigger('submit')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/matches/m1/media',
      expect.objectContaining({ method: 'POST', body: expect.objectContaining({ kind: 'LIVE', url: 'https://youtu.be/new1', embeddable: null }) }),
    )
  })
})
