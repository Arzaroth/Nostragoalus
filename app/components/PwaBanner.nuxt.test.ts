import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PwaBanner from './PwaBanner.vue'

// All signals are shared useState - reset between tests so one test's dismissal
// (or a left-over download flag) doesn't leak into the next.
beforeEach(() => {
  useState('outdated-build', () => false).value = false
  useState('update-dismissed', () => false).value = false
  useState('sw-downloading', () => false).value = false
})

describe('PwaBanner', () => {
  it('renders nothing while the build is current', async () => {
    const c = await mountSuspended(PwaBanner)
    expect(c.text().trim()).toBe('')
  })

  it('offers a reload once the build manifest flags a new deploy', async () => {
    const outdated = useState('outdated-build', () => false)
    const c = await mountSuspended(PwaBanner)
    outdated.value = true
    await c.vm.$nextTick()
    expect(c.text()).toContain('A new version is available')
    expect(c.find('button').exists()).toBe(true)
  })

  it('shows a downloading indicator while a new worker precaches', async () => {
    const downloading = useState('sw-downloading', () => false)
    const c = await mountSuspended(PwaBanner)
    downloading.value = true
    await c.vm.$nextTick()
    expect(c.text()).toContain('Downloading update')
    // Transient phase: no actions to take while it downloads.
    expect(c.find('button').exists()).toBe(false)
  })

  it('prefers the ready phase over a concurrent download', async () => {
    const outdated = useState('outdated-build', () => false)
    const downloading = useState('sw-downloading', () => false)
    outdated.value = true
    downloading.value = true
    const c = await mountSuspended(PwaBanner)
    expect(c.text()).toContain('A new version is available')
    expect(c.text()).not.toContain('Downloading update')
  })

  it('hides after dismiss', async () => {
    useState('outdated-build', () => false).value = true
    const c = await mountSuspended(PwaBanner)
    const dismiss = c.findAll('button').at(-1)
    await dismiss!.trigger('click')
    expect(c.text().trim()).toBe('')
  })

  it('re-surfaces after dismiss when a fresh deploy is flagged', async () => {
    const outdated = useState('outdated-build', () => false)
    const dismissed = useState('update-dismissed', () => false)
    outdated.value = true
    const c = await mountSuspended(PwaBanner)
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
    const c = await mountSuspended(PwaBanner)
    await c.find('button').trigger('click') // first button = reload (no SW in test, so straight reload)
    expect(reloadSpy).toHaveBeenCalled()
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
