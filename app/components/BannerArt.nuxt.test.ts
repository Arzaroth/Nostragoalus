import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import BannerArt from './BannerArt.vue'

const skin = ref<string | null>(null)
mockNuxtImport('useSkin', () => () => ({ skin }))

const props = { ballScale: 1, subtitleOpacity: 1, titleScale: 1, titleShift: 0 }

beforeEach(() => {
  skin.value = null
})
afterEach(() => {
  skin.value = null
})

describe('BannerArt planet', () => {
  it('renders the football planet when no skin is active', async () => {
    const wrapper = await mountSuspended(BannerArt, { props })
    expect(wrapper.html()).toContain('url(#ball)')
  })

  it('swaps in the active pony head, dropping the football planet', async () => {
    skin.value = 'pinkie'
    const wrapper = await mountSuspended(BannerArt, { props })
    const html = wrapper.html()
    expect(html).toContain('#e8489a') // Pinkie's magenta mane
    expect(html).not.toContain('url(#ball)')
  })
})
