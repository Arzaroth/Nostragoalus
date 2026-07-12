import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import VoiceCallButton from './VoiceCallButton.vue'

const inCall = ref(false)
const here = ref(false)
const counts = ref<Record<string, number>>({})
const names = ref<Record<string, string[]>>({})
const startDmCall = vi.fn()
const joinLeagueVoice = vi.fn()

mockNuxtImport('useVoiceCall', () => () => ({
  inCall,
  isInScope: () => here.value,
  voiceCountFor: (key: string) => counts.value[key] ?? 0,
  voiceNamesFor: (key: string) => names.value[key] ?? [],
  startDmCall,
  joinLeagueVoice,
}))

beforeEach(() => {
  inCall.value = false
  here.value = false
  counts.value = {}
  names.value = {}
  startDmCall.mockClear()
  joinLeagueVoice.mockClear()
})
afterEach(() => vi.clearAllMocks())

describe('VoiceCallButton', () => {
  it('places a DM call to the peer on click', async () => {
    const w = await mountSuspended(VoiceCallButton, { props: { isDm: true, threadId: 't1', calleeId: 'bob' } })
    expect(w.find('button').exists()).toBe(true)
    await w.find('button').trigger('click')
    expect(startDmCall).toHaveBeenCalledWith('t1', 'bob')
  })

  it('does not render for a DM with no peer resolved yet', async () => {
    const w = await mountSuspended(VoiceCallButton, { props: { isDm: true, threadId: 't1', calleeId: null } })
    expect(w.find('button').exists()).toBe(false)
  })

  it('joins a league room and shows the N-in-voice badge', async () => {
    counts.value = { 'league:l1': 3 }
    const w = await mountSuspended(VoiceCallButton, { props: { isDm: false, leagueId: 'l1', matchId: null } })
    expect(w.text()).toContain('3')
    await w.find('button').trigger('click')
    expect(joinLeagueVoice).toHaveBeenCalledWith('l1', null)
  })

  it('keys the badge to the match room when match-scoped', async () => {
    counts.value = { 'league:l1:match:m9': 2 }
    const w = await mountSuspended(VoiceCallButton, { props: { isDm: false, leagueId: 'l1', matchId: 'm9' } })
    expect(w.text()).toContain('2')
  })

  it('hides once this tab is already in the room (the in-call bar takes over)', async () => {
    here.value = true
    const w = await mountSuspended(VoiceCallButton, { props: { isDm: false, leagueId: 'l1', matchId: null } })
    expect(w.find('button').exists()).toBe(false)
  })

  it('disables the button while busy in another call', async () => {
    inCall.value = true // in a call, but not this scope (here=false)
    const w = await mountSuspended(VoiceCallButton, { props: { isDm: true, threadId: 't1', calleeId: 'bob' } })
    expect(w.find('button').attributes('disabled')).toBeDefined()
    await w.find('button').trigger('click')
    expect(startDmCall).not.toHaveBeenCalled()
  })
})
