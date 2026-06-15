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
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('renders the active pony head image for a skin', async () => {
    skin.value = 'pinkie'
    const wrapper = await mountSuspended(LogoMark)
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('/skins/pinkie.png')
    expect(wrapper.html()).not.toContain('lm-orb')
  })
})
