import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import LeagueOnboardingDialog from './LeagueOnboardingDialog.vue'

const sessionUser = ref<Record<string, unknown> | null>({ id: 'u1', leaguePromptDismissedAt: null })
const myLeagues = ref<Array<{ id: string }>>([])

mockNuxtImport('useAuth', () => () => ({
  session: ref({ data: sessionUser.value ? { user: sessionUser.value } : null }),
}))
mockNuxtImport('useMyLeagues', () => () => ({ data: myLeagues, isSuccess: ref(true) }))

let fetchMock: ReturnType<typeof vi.fn>
const mounted: Array<{ unmount: () => void }> = []

async function mount() {
  const wrapper = await mountSuspended(LeagueOnboardingDialog)
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  sessionUser.value = { id: 'u1', leaguePromptDismissedAt: null }
  myLeagues.value = []
  fetchMock = vi.fn(async () => ({ ok: true, league: { id: 'l1' } }))
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => {
  // Unmount before clearing the body: the Dialog teleports there and Vue
  // would otherwise patch into removed nodes.
  while (mounted.length) mounted.pop()!.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('LeagueOnboardingDialog', () => {
  it('shows for a fresh user with no leagues', async () => {
    await mount()
    await nextTick()
    expect(document.body.textContent).toContain('Got a league code?')
  })

  it('stays hidden when the flag is already set', async () => {
    sessionUser.value = { id: 'u1', leaguePromptDismissedAt: '2026-06-01T00:00:00Z' }
    await mount()
    await nextTick()
    expect(document.body.textContent).not.toContain('Got a league code?')
  })

  it('stays hidden when the user already has a league', async () => {
    myLeagues.value = [{ id: 'l1' }]
    await mount()
    await nextTick()
    expect(document.body.textContent).not.toContain('Got a league code?')
  })

  it('skip dismisses server-side and never reopens this session', async () => {
    await mount()
    await nextTick()
    const skip = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes('Maybe later'))
    expect(skip).toBeTruthy()
    skip!.click()
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/me/league-prompt', expect.objectContaining({ method: 'POST' })),
    )
    await nextTick()
    expect(document.body.textContent).not.toContain('Got a league code?')
  })
})
