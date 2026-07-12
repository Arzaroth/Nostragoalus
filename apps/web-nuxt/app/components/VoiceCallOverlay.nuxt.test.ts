import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import VoiceCallOverlay from './VoiceCallOverlay.client.vue'
import type { CallState, IncomingRing } from '../composables/useVoiceCall'

const state = ref<CallState>('idle')
const activeScope = ref<{ kind: 'dm'; threadId: string } | { kind: 'league'; leagueId: string; matchId: string | null } | null>(null)
const roster = ref<string[]>([])
const rosterNames = ref<Record<string, string>>({})
const remoteStreams = ref<Record<string, MediaStream>>({})
const incoming = ref<IncomingRing | null>(null)
const muted = ref(false)
const errorKey = ref<string | null>(null)
const localLevel = ref(0)
const speakingPeers = ref<Record<string, boolean>>({})
const mutedTalkingAt = ref(0)
const inputDevices = ref<{ deviceId: string; label: string }[]>([])
const outputDevices = ref<{ deviceId: string; label: string }[]>([])
const inputDeviceId = ref<string | null>(null)
const outputDeviceId = ref<string | null>(null)
const noiseSuppression = ref(true)
const canPickOutput = ref(true)
const refreshDevices = vi.fn()
const setInputDevice = vi.fn()
const setOutputDevice = vi.fn()
const setNoiseSuppression = vi.fn()
const accept = vi.fn()
const decline = vi.fn()
const hangup = vi.fn()
const invite = vi.fn()
const toggleMute = vi.fn()

mockNuxtImport('useVoiceCall', () => () => ({
  state,
  activeScope,
  roster,
  rosterNames,
  remoteStreams,
  incoming,
  muted,
  errorKey,
  localLevel,
  speakingPeers,
  mutedTalkingAt,
  inputDevices,
  outputDevices,
  inputDeviceId,
  outputDeviceId,
  noiseSuppression,
  canPickOutput,
  refreshDevices,
  setInputDevice,
  setOutputDevice,
  setNoiseSuppression,
  accept,
  decline,
  hangup,
  invite,
  toggleMute,
}))
mockNuxtImport('useLeagueDetail', () => () => ({ data: ref({ members: [] }) }))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))
mockNuxtImport('useAuth', () => () => ({ session: ref({ data: { user: { id: 'me' } } }) }))

beforeEach(() => {
  state.value = 'idle'
  activeScope.value = null
  roster.value = []
  rosterNames.value = {}
  incoming.value = null
  muted.value = false
  localLevel.value = 0
  speakingPeers.value = {}
  mutedTalkingAt.value = 0
  inputDevices.value = []
  outputDevices.value = []
  inputDeviceId.value = null
  outputDeviceId.value = null
  noiseSuppression.value = true
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

  it('names the other participants in the in-call bar', async () => {
    state.value = 'in-call'
    activeScope.value = { kind: 'dm', threadId: 't1' }
    roster.value = ['me', 'bob']
    rosterNames.value = { me: 'Me', bob: 'Bob' }
    const w = await mountSuspended(VoiceCallOverlay)
    // Self is not listed; the peer is, from the server-shipped roster names.
    expect(w.text()).toContain('Bob')
    expect(w.text()).not.toContain('Me,')
  })

  it('highlights a speaking participant', async () => {
    state.value = 'in-call'
    activeScope.value = { kind: 'dm', threadId: 't1' }
    roster.value = ['me', 'bob']
    rosterNames.value = { me: 'Me', bob: 'Bob' }
    speakingPeers.value = { bob: true }
    const w = await mountSuspended(VoiceCallOverlay)
    // The innermost span is the name itself (its wrapper also texts as 'Bob').
    const bob = w.findAll('span').filter((s) => s.text() === 'Bob').at(-1)
    expect(bob!.attributes('style')).toContain('font-weight')
  })

  it('opens the audio settings with device pickers and the noise toggle', async () => {
    state.value = 'in-call'
    activeScope.value = { kind: 'dm', threadId: 't1' }
    inputDevices.value = [{ deviceId: 'mic1', label: 'USB Mic' }]
    outputDevices.value = [{ deviceId: 'spk1', label: 'Headphones' }]
    const w = await mountSuspended(VoiceCallOverlay)
    const gear = w.findAll('button').find((b) => b.attributes('aria-label') === 'Audio settings')
    await gear!.trigger('click')
    expect(refreshDevices).toHaveBeenCalled()
    // The settings dialog is teleported to <body>.
    expect(document.body.textContent).toContain('Microphone')
    expect(document.body.textContent).toContain('Noise suppression')
  })

  it('exposes an invite control only for a league call', async () => {
    state.value = 'in-call'
    activeScope.value = { kind: 'league', leagueId: 'l1', matchId: null }
    const w = await mountSuspended(VoiceCallOverlay)
    const labels = w.findAll('button').map((b) => b.attributes('aria-label'))
    expect(labels).toContain('Invite to call')
  })
})
