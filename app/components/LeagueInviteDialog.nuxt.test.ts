import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import LeagueInviteDialog from './LeagueInviteDialog.vue'

const INVITES = [
  { id: 'i1', token: 'tok123', expiresAt: null, maxUses: null, uses: 3, createdAt: '2026-06-13T00:00:00Z', status: 'VALID' },
]

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  document.body.innerHTML = ''
  fetchMock = vi.fn(async (url: string, opts?: any) => {
    if (opts?.method === 'POST') return { invite: { ...INVITES[0], id: 'i2', token: 'newtok' } }
    if (opts?.method === 'DELETE') return { ok: true }
    return { invites: INVITES }
  })
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function setup() {
  const wrapper = await mountSuspended(
    defineComponent({
      components: { LeagueInviteDialog },
      setup() {
        useQueryClient().clear()
      },
      template: '<LeagueInviteDialog :league-id="\'l1\'" :visible="true" />',
    }),
  )
  return wrapper
}

describe('LeagueInviteDialog', () => {
  it('lists existing invites for the league', async () => {
    const c = await setup()
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/leagues/l1/invites', expect.anything())
      expect(document.body.textContent).toContain('tok123')
    })
  })

  it('mints a new invite with the chosen expiry and max uses', async () => {
    await setup()
    await vi.waitFor(() => expect(document.body.textContent).toContain('tok123'))
    const createBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Create link'))
    expect(createBtn).toBeTruthy()
    createBtn!.click()
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/leagues/l1/invites',
        expect.objectContaining({ method: 'POST', body: { expiresInHours: 168, maxUses: null } }),
      ),
    )
  })
})
