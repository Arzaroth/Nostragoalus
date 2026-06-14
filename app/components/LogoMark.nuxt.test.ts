import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import LogoMark from './LogoMark.vue'

const skin = ref<string | null>(null)
mockNuxtImport('useSkin', () => () => ({ skin }))

beforeEach(() => {
  skin.value = null
})
afterEach(() => {
  skin.value = null
})

describe('LogoMark', () => {
  it('renders the default crystal ball when no skin is active', async () => {
    const wrapper = await mountSuspended(LogoMark)
    expect(wrapper.html()).toContain('lm-orb')
  })

  it('swaps to the matching pony mark for the active skin', async () => {
    skin.value = 'pinkie'
    const wrapper = await mountSuspended(LogoMark)
    expect(wrapper.html()).toContain('pp-orb')
    expect(wrapper.html()).not.toContain('lm-orb')
  })

  it('renders a distinct mark per pony', async () => {
    const marker: Record<string, string> = {
      twilight: 'tw-orb',
      rainbow: 'rd-orb',
      applejack: 'aj-orb',
      rarity: 'ra-orb',
      fluttershy: 'fs-orb',
    }
    for (const [id, id2] of Object.entries(marker)) {
      skin.value = id
      const wrapper = await mountSuspended(LogoMark)
      expect(wrapper.html()).toContain(id2)
    }
  })
})
