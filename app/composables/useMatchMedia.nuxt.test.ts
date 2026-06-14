import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useMatchMedia, useMatchMediaActions } from './useMatchMedia'

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ media: [{ id: 'mm1', kind: 'LIVE', url: 'https://youtu.be/x', label: null, embeddable: true }], id: 'mm1', ok: true }))
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('useMatchMedia', () => {
  it('fetches the watch links for the match', async () => {
    const id = ref('match-1')
    await mountSuspended({
      setup() {
        useMatchMedia(id)
        return () => null
      },
    })
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/matches/match-1/media', expect.objectContaining({}))
    })
  })
})

describe('useMatchMediaActions', () => {
  it('posts a new link and deletes by id against the admin routes', async () => {
    const id = ref('match-1')
    let actions!: ReturnType<typeof useMatchMediaActions>
    await mountSuspended({
      setup() {
        actions = useMatchMediaActions(id)
        return () => null
      },
    })

    await actions.add.mutateAsync({ kind: 'LIVE', url: 'https://youtu.be/x', embeddable: null })
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/matches/match-1/media', expect.objectContaining({
      method: 'POST',
      body: { kind: 'LIVE', url: 'https://youtu.be/x', embeddable: null },
    }))

    await actions.remove.mutateAsync('mm1')
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/matches/match-1/media/mm1', expect.objectContaining({ method: 'DELETE' }))
  })
})
