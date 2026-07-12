import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import VoiceCallOverlay from './VoiceCallOverlay.client.vue'
import type { CallState, IncomingRing } from '../composables/useVoiceCall'

const state = ref<CallState>('idle')
const activeScope = ref<{ kind: 'dm'; threadId: string } | { kind: 'league'; leagueId: string; matchId: string | null } | null>(null)
const roster = ref<string[]>([])
const remoteStreams = ref<Record<string, MediaStream>>({})
const incoming = ref<IncomingRing | null>(null)
const muted = ref(false)
const errorKey = ref<string | null>(null)
const accept = vi.fn()
const decline = vi.fn()
const hangup = vi.fn()
const invite = vi.fn()
const toggleMute = vi.fn()

mockNuxtImport('useVoiceCall', () => () => ({
  state,
  activeScope,
  roster,
  remoteStreams,
  incoming,
  muted,
  errorKey,
  accept,
  decline,
  hangup,
  invite,
  toggleMute,
}))
mockNuxtImport('useLeagueDetail', () => () => ({ data: ref({ members: [] }) }))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

beforeEach(() => {
  state.value = 'idle'
  activeScope.value = null
  roster.value = []
  incoming.value = null
  muted.value = false
})
afterEach(() => vi.clearAllMocks())

describe('VoiceCallOverlay', () => {
  it('renders nothing actionable when idle', async () => {
    const w = await mountSuspended(VoiceCallOverlay)
    expect(w.text()).not.toContain('Ringing')
    expect(w.findAll('button').length).toBe(0)
  })

  it('shows the incoming ring with accept and decline', async () => {
    state.value = 'incoming'
    incoming.value = { scope: { kind: 'dm', threadId: 't1' }, from: 'bob', fromName: 'Bob' }
    await mountSuspended(VoiceCallOverlay)
    // The ring is a PrimeVue Dialog, teleported to <body>.
    expect(document.body.textContent).toContain('Bob')
    const buttons = [...document.body.querySelectorAll('button')]
    const accBtn = buttons.find((b) => b.textContent?.includes('Accept'))
    accBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(accept).toHaveBeenCalled()
  })

  it('shows the in-call bar with mute and hang-up', async () => {
    state.value = 'in-call'
    activeScope.value = { kind: 'dm', threadId: 't1' }
    const w = await mountSuspended(VoiceCallOverlay)
    // Mute + hang-up controls are present.
    const labels = w.findAll('button').map((b) => b.attributes('aria-label'))
    expect(labels).toContain('Mute')
    expect(labels).toContain('Hang up')
    const hangBtn = w.findAll('button').find((b) => b.attributes('aria-label') === 'Hang up')
    await hangBtn!.trigger('click')
    expect(hangup).toHaveBeenCalled()
  })

  it('exposes an invite control only for a league call', async () => {
    state.value = 'in-call'
    activeScope.value = { kind: 'league', leagueId: 'l1', matchId: null }
    const w = await mountSuspended(VoiceCallOverlay)
    const labels = w.findAll('button').map((b) => b.attributes('aria-label'))
    expect(labels).toContain('Invite to call')
  })
})
