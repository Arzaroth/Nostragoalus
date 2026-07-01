import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useQueryClient } from '@tanstack/vue-query'
import { defineComponent, h } from 'vue'
import type { CabinetDto } from '#shared/types/achievements'
import TrophyCabinet from './TrophyCabinet.vue'

const CABINET: CabinetDto = {
  userId: 'u1',
  displayName: 'Alice',
  isOwner: true,
  trophies: [{ type: 'OVERALL', value: 42, teamCode: null, awardedAt: '2026-07-19T00:00:00.000Z' }],
  achievements: [
    {
      key: 'first-blood',
      category: 'MILESTONE',
      scope: 'COMPETITION',
      hidden: false,
      tiers: [{ tier: 'BRONZE', threshold: 1 }],
      earned: { tier: 'BRONZE', progress: 1, unlockedAt: '2026-06-12T00:00:00.000Z' },
    },
    {
      key: 'sharpshooter',
      category: 'MILESTONE',
      scope: 'COMPETITION',
      hidden: false,
      tiers: [{ tier: 'BRONZE', threshold: 5 }],
      earned: null,
    },
  ],
  fridge: [{ slot: 0, itemType: 'TROPHY', itemKey: 'OVERALL' }],
}

let wrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null

beforeEach(() => {
  vi.stubGlobal('$fetch', vi.fn(async () => CABINET))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
})

// The query cache is shared across tests; clear it so each test's $fetch stub
// actually runs past the app-level 60s staleTime.
async function clearCache() {
  const c = await mountSuspended(
    defineComponent({
      setup() {
        useQueryClient().clear()
        return () => h('div')
      },
    }),
  )
  c.unmount()
}

describe('TrophyCabinet', () => {
  it('renders trophies, earned + locked achievements and the owner edit control', async () => {
    await clearCache()
    wrapper = await mountSuspended(TrophyCabinet, { props: { userId: 'u1' } })
    await vi.waitFor(() => expect(wrapper!.text()).toContain('Grand Champion'))
    expect(wrapper.text()).toContain('First Blood')
    // Locked badges are rendered greyed.
    expect(wrapper.html()).toContain('opacity-40')
    // The owner gets the fridge-arrange control.
    expect(wrapper.text()).toContain('Arrange fridge')
  })

  it('enters fridge edit mode on the owner control', async () => {
    await clearCache()
    wrapper = await mountSuspended(TrophyCabinet, { props: { userId: 'u1' } })
    await vi.waitFor(() => expect(wrapper!.text()).toContain('Grand Champion'))
    const arrange = wrapper!
      .findAll('button')
      .find((b: { text: () => string; trigger: (e: string) => Promise<void> }) => b.text().includes('Arrange fridge'))
    await arrange!.trigger('click')
    expect(wrapper.text()).toContain('Done')
  })
})
