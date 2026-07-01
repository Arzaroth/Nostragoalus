import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import MultiviewCell from './Cell.vue'
import MultiviewCellStream from './CellStream.vue'

const media = ref<any[]>([])

mockNuxtImport('useMatchMedia', () => () => ({ data: media }))
mockNuxtImport('useMatchLiveDetail', () => () => ({ data: ref(null) }))
mockNuxtImport('useMatchTimeline', () => () => ({ data: ref([]) }))

const liveItem = { id: 'x1', kind: 'LIVE', url: 'https://www.youtube.com/watch?v=abc', label: '', embeddable: true, sandbox: null, allow: null }
const match = { id: 'm1', status: 'LIVE', fullTimeHome: 1, fullTimeAway: 0, homeTeam: 'France', awayTeam: 'Argentina', homeTeamCode: 'FRA', awayTeamCode: 'ARG' } as any

function streamButton(c: any) {
  return c.findAll('button').find((b: any) => b.text() === 'Stream')
}

describe('MultiviewCell stream toggle', () => {
  it('enables Stream when the match has embeddable media and emits the switch', async () => {
    media.value = [liveItem]
    const c = await mountSuspended(MultiviewCell, { props: { matchId: 'm1', match, viewMode: 'tile', streamAllowed: true } })
    const btn = streamButton(c)
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(c.emitted('update:viewMode')?.[0]).toEqual(['stream'])
  })

  it('renders the stream embed when in stream mode', async () => {
    media.value = [liveItem]
    const c = await mountSuspended(MultiviewCell, { props: { matchId: 'm1', match, viewMode: 'stream', streamAllowed: true } })
    expect(c.findComponent(MultiviewCellStream).exists()).toBe(true)
  })

  it('disables Stream when there is no media', async () => {
    media.value = []
    const c = await mountSuspended(MultiviewCell, { props: { matchId: 'm1', match, viewMode: 'tile', streamAllowed: true } })
    const btn = streamButton(c)
    expect(btn.attributes('disabled')).toBeDefined()
    await btn.trigger('click')
    expect(c.emitted('update:viewMode')).toBeUndefined()
  })

  it('disables Stream when the concurrent-stream cap is reached', async () => {
    media.value = [liveItem]
    const c = await mountSuspended(MultiviewCell, { props: { matchId: 'm1', match, viewMode: 'tile', streamAllowed: false } })
    expect(streamButton(c).attributes('disabled')).toBeDefined()
  })
})
