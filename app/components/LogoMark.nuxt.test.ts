import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ref, nextTick } from 'vue'
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
    await nextTick()
    expect(wrapper.html()).toContain('lm-orb')
  })

  it('swaps to the matching pony crystal-ball variant for the active skin', async () => {
    skin.value = 'twilight'
    const wrapper = await mountSuspended(LogoMark)
    await nextTick()
    expect(wrapper.html()).toContain('tw-orb')
    expect(wrapper.html()).not.toContain('lm-orb')
  })
})
