import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import UpdateBanner from './UpdateBanner.vue'

describe('UpdateBanner', () => {
  it('renders nothing while the build is current', async () => {
    useState('outdated-build', () => false).value = false
    const c = await mountSuspended(UpdateBanner)
    expect(c.text().trim()).toBe('')
  })

  it('offers a reload once the build manifest flags a new deploy', async () => {
    const outdated = useState('outdated-build', () => false)
    const c = await mountSuspended(UpdateBanner)
    outdated.value = true
    await c.vm.$nextTick()
    expect(c.text()).toContain('A new version is available')
    expect(c.find('button').exists()).toBe(true)
  })

  it('hides after dismiss', async () => {
    useState('outdated-build', () => false).value = true
    const c = await mountSuspended(UpdateBanner)
    const dismiss = c.findAll('button').at(-1)
    await dismiss!.trigger('click')
    expect(c.text().trim()).toBe('')
  })
})
