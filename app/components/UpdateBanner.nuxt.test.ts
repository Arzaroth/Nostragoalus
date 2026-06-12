import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import UpdateBanner from './UpdateBanner.vue'

// Both signals are shared useState - reset between tests so one test's dismissal
// doesn't latch the banner hidden for the next.
beforeEach(() => {
  useState('outdated-build', () => false).value = false
  useState('update-dismissed', () => false).value = false
})

describe('UpdateBanner', () => {
  it('renders nothing while the build is current', async () => {
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

  it('re-surfaces after dismiss when a fresh deploy is flagged', async () => {
    const outdated = useState('outdated-build', () => false)
    const dismissed = useState('update-dismissed', () => false)
    outdated.value = true
    const c = await mountSuspended(UpdateBanner)
    await c.findAll('button').at(-1)!.trigger('click')
    expect(c.text().trim()).toBe('')
    // The manifest-poll plugin clears the dismissal on the next deploy.
    dismissed.value = false
    await c.vm.$nextTick()
    expect(c.text()).toContain('A new version is available')
  })

  it('reloads the page from the reload button', async () => {
    const reloadSpy = vi.fn()
    Object.defineProperty(window.location, 'reload', { configurable: true, value: reloadSpy })
    useState('outdated-build', () => false).value = true
    const c = await mountSuspended(UpdateBanner)
    await c.find('button').trigger('click') // first button = reload (no SW in test, so straight reload)
    expect(reloadSpy).toHaveBeenCalled()
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
