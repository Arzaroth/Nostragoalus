import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useQueryClient, type QueryClient } from '@tanstack/vue-query'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useLeagueActions, useMyLeagues, usePublicLeagues } from './useLeagues'

vi.mock('./useAuth', async () => {
  const { ref } = await import('vue')
  const session = ref<{ data: { user: { id: string } } | null }>({ data: { user: { id: 'u1' } } })
  return { useAuth: () => ({ session }), __session: session }
})

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ leagues: [], league: { id: 'l1' }, ok: true, joinCode: 'X' }))
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('useMyLeagues / usePublicLeagues', () => {
  it('passes the competition filter and gates on the session', async () => {
    const slug = ref<string | undefined>('world-cup-2026')
    await mountSuspended({
      setup() {
        useMyLeagues(slug)
        usePublicLeagues(slug)
        return () => null
      },
    })
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/leagues', expect.objectContaining({ query: { competition: 'world-cup-2026' } }))
      expect(fetchMock).toHaveBeenCalledWith('/api/leagues/public', expect.objectContaining({ query: { competition: 'world-cup-2026' } }))
    })
  })

  it('does not fetch for guests', async () => {
    const session = ((await import('./useAuth')) as any).__session
    session.value = { data: null }
    await mountSuspended({
      setup() {
        useMyLeagues()
        return () => null
      },
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchMock).not.toHaveBeenCalled()
    session.value = { data: { user: { id: 'u1' } } }
  })
})

describe('useLeagueActions', () => {
  async function setup() {
    let actions!: ReturnType<typeof useLeagueActions>
    let queryClient!: QueryClient
    await mountSuspended({
      setup() {
        queryClient = useQueryClient()
        actions = useLeagueActions()
        return () => null
      },
    })
    // The harness shares one nuxt app (and queryClient) across mounts, so the
    // spy survives between tests - reset its history per setup.
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    invalidate.mockClear()
    return { actions, invalidate }
  }

  it('join posts the code and invalidates leagues + leaderboard', async () => {
    const { actions, invalidate } = await setup()
    await actions.join.mutateAsync({ code: 'ABCD2345' })
    expect(fetchMock).toHaveBeenCalledWith('/api/leagues/join', expect.objectContaining({ method: 'POST', body: { code: 'ABCD2345' } }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['leagues'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['leaderboard'] })
  })

  it('rename invalidates leagues but not the leaderboard', async () => {
    const { actions, invalidate } = await setup()
    await actions.update.mutateAsync({ leagueId: 'l1', name: 'New name' })
    expect(fetchMock).toHaveBeenCalledWith('/api/leagues/l1', expect.objectContaining({ method: 'PUT' }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['leagues'] })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['leaderboard'] })
  })

  it('membership mutations hit their endpoints', async () => {
    const { actions } = await setup()
    await actions.joinPublic.mutateAsync('l9')
    expect(fetchMock).toHaveBeenCalledWith('/api/leagues/l9/join', expect.objectContaining({ method: 'POST' }))
    await actions.leave.mutateAsync('l9')
    expect(fetchMock).toHaveBeenCalledWith('/api/leagues/l9/leave', expect.objectContaining({ method: 'POST' }))
    await actions.kick.mutateAsync({ leagueId: 'l9', userId: 'u2' })
    expect(fetchMock).toHaveBeenCalledWith('/api/leagues/l9/members/u2', expect.objectContaining({ method: 'DELETE' }))
    await actions.setRole.mutateAsync({ leagueId: 'l9', userId: 'u2', role: 'MODERATOR' })
    expect(fetchMock).toHaveBeenCalledWith('/api/leagues/l9/members/u2', expect.objectContaining({ method: 'PUT', body: { role: 'MODERATOR' } }))
    await actions.transferOwnership.mutateAsync({ leagueId: 'l9', userId: 'u2' })
    expect(fetchMock).toHaveBeenCalledWith('/api/leagues/l9/transfer-ownership', expect.objectContaining({ method: 'POST' }))
    await actions.regenerateCode.mutateAsync('l9')
    expect(fetchMock).toHaveBeenCalledWith('/api/leagues/l9/regenerate-code', expect.objectContaining({ method: 'POST' }))
    await actions.remove.mutateAsync('l9')
    expect(fetchMock).toHaveBeenCalledWith('/api/leagues/l9', expect.objectContaining({ method: 'DELETE' }))
  })
})
