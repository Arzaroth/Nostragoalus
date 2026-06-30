import { afterEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { PastPickCounterfactual } from '#shared/types/past-pick'
import PastPickHint from './PastPickHint.vue'

const data = ref<PastPickCounterfactual | undefined>(undefined)
mockNuxtImport('useMyPastPicks', () => () => ({ data, refetch: () => {} }))

const props = { matchId: 'm1', started: true, live: false, liveKey: null as number | null }

afterEach(() => {
  data.value = undefined
})

describe('PastPickHint', () => {
  it('renders nothing when there is no counterfactual', async () => {
    data.value = { scope: 'none' }
    const w = await mountSuspended(PastPickHint, { props })
    expect(w.text()).toBe('')
    w.unmount()
  })

  it('shows the regret line on a finished match', async () => {
    data.value = {
      scope: 'final',
      earlier: { home: 1, away: 0, points: 3, tier: 'EXACT' },
      kept: { home: 2, away: 2, points: 0, tier: 'MISS' },
      cheeky: false,
    }
    const w = await mountSuspended(PastPickHint, { props })
    expect(w.text()).toContain('1–0')
    expect(w.text()).toContain('would have scored')
    expect(w.html()).not.toContain('animate-pulse')
    w.unmount()
  })

  it('shows the cheeky line for a winning 0-0', async () => {
    data.value = {
      scope: 'final',
      earlier: { home: 0, away: 0, points: 3, tier: 'EXACT' },
      kept: { home: 1, away: 0, points: 0, tier: 'MISS' },
      cheeky: true,
    }
    const w = await mountSuspended(PastPickHint, { props })
    expect(w.text()).toContain('not worth watching')
    w.unmount()
  })

  it('shows a provisional live line with a pulsing dot', async () => {
    data.value = {
      scope: 'live',
      earlier: { home: 2, away: 1, points: 3, tier: 'EXACT' },
      kept: { home: 0, away: 0, points: 0, tier: 'MISS' },
      cheeky: false,
    }
    const w = await mountSuspended(PastPickHint, { props: { ...props, live: true, liveKey: 3 } })
    expect(w.text()).toContain('2–1')
    expect(w.text()).toContain('Still in play')
    expect(w.html()).toContain('animate-pulse')
    w.unmount()
  })
})
