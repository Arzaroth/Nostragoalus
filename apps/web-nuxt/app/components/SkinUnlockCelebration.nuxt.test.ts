import { describe, expect, it } from 'vitest'
import { ref, nextTick } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import SkinUnlockCelebration from './SkinUnlockCelebration.vue'

const celebrate = ref(0)
mockNuxtImport('useSkin', () => () => ({ celebrate }))

describe('SkinUnlockCelebration', () => {
  it('stays hidden until celebrate is bumped, then pops', async () => {
    celebrate.value = 0
    const wrapper = await mountSuspended(SkinUnlockCelebration)
    expect(document.body.textContent).not.toContain('My Little Prono unlocked')

    celebrate.value += 1
    await nextTick()
    expect(document.body.textContent).toContain('My Little Prono unlocked')

    wrapper.unmount()
  })
})
