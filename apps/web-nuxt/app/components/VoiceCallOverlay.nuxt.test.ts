import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
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
const connectionQuality = ref<'good' | 'fair' | 'poor' | null>(null)
const reconnecting = ref(false)
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
  connectionQuality,
  reconnecting,
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
const toastAdd = vi.fn()
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))
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
  connectionQuality.value = null
  reconnecting.value = false
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

  it('highlights a speaking participant by color only (no layout shift)', async () => {
    state.value = 'in-call'
    activeScope.value = { kind: 'dm', threadId: 't1' }
    roster.value = ['me', 'bob']
    rosterNames.value = { me: 'Me', bob: 'Bob' }
    speakingPeers.value = { bob: true }
    const w = await mountSuspended(VoiceCallOverlay)
    // The innermost span is the name itself (its wrapper also texts as 'Bob').
    const bob = w.findAll('span').filter((s) => s.text() === 'Bob').at(-1)
    expect(bob!.attributes('style')).toContain('--p-primary-color')
    // A width-changing style (font-weight) would shift the whole bar per utterance.
    expect(bob!.attributes('style')).not.toContain('font-weight')
  })

  it('keeps a reachable unmute control while muted (strike, not a missing glyph)', async () => {
    state.value = 'in-call'
    activeScope.value = { kind: 'dm', threadId: 't1' }
    muted.value = true
    const w = await mountSuspended(VoiceCallOverlay)
    const unmute = w.findAll('button').find((b) => b.attributes('aria-label') === 'Unmute')
    expect(unmute).toBeTruthy()
    // primeicons has no microphone-slash: the icon stays pi-microphone + a strike.
    expect(unmute!.find('.pi-microphone').exists()).toBe(true)
    expect(unmute!.findAll('span').length).toBeGreaterThan(1)
    await unmute!.trigger('click')
    expect(toggleMute).toHaveBeenCalled()
  })

  it('renders the waveform meter and lifts the bars with the level', async () => {
    state.value = 'in-call'
    activeScope.value = { kind: 'dm', threadId: 't1' }
    localLevel.value = 0
    const w = await mountSuspended(VoiceCallOverlay)
    const bars = () => w.find('[aria-hidden="true"]').findAll('span')
    expect(bars().length).toBe(5)
    const silentHeights = bars().map((b) => b.attributes('style'))
    localLevel.value = 0.2
    await nextTick()
    expect(bars().map((b) => b.attributes('style'))).not.toEqual(silentHeights)
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

  it('flags a degraded link and a reconnect in the in-call bar', async () => {
    state.value = 'in-call'
    activeScope.value = { kind: 'dm', threadId: 't1' }
    connectionQuality.value = 'poor'
    const w = await mountSuspended(VoiceCallOverlay)
    expect(w.find('[aria-label="Poor connection"]').exists()).toBe(true)

    reconnecting.value = true
    await nextTick()
    expect(w.text()).toContain('Reconnecting')
    // The reconnect chip replaces the quality icon (one signal at a time).
    expect(w.find('[aria-label="Poor connection"]').exists()).toBe(false)
  })

  it('exposes an invite control only for a league call', async () => {
    state.value = 'in-call'
    activeScope.value = { kind: 'league', leagueId: 'l1', matchId: null }
    const w = await mountSuspended(VoiceCallOverlay)
    const labels = w.findAll('button').map((b) => b.attributes('aria-label'))
    expect(labels).toContain('Invite to call')
  })

  it('nudges when talking while muted, but not on mount', async () => {
    state.value = 'in-call'
    activeScope.value = { kind: 'dm', threadId: 't1' }
    mutedTalkingAt.value = 0
    const w = await mountSuspended(VoiceCallOverlay)
    expect(toastAdd).not.toHaveBeenCalled()

    mutedTalkingAt.value = Date.now()
    await nextTick()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ summary: "You're muted" }))
    w.unmount()
  })

  it('starts the clock immediately when mounted mid-call', async () => {
    vi.useFakeTimers()
    try {
      state.value = 'in-call'
      activeScope.value = { kind: 'dm', threadId: 't1' }
      const w = await mountSuspended(VoiceCallOverlay)
      await vi.advanceTimersByTimeAsync(1000)
      await nextTick()
      expect(w.text()).toContain('0:01')
      expect(w.text()).not.toContain('0:00')
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
