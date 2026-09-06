import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AndroidAppCard from './AndroidAppCard.vue'

const PUBLISHED = {
  available: true,
  version: '4.7.0',
  sizeBytes: 62_914_560,
  sha256: 'abcdef0123456789'.repeat(4),
  builtAt: '2026-09-06T09:30:00.000Z',
  downloadUrl: '/download/nostragoalus.apk',
}
const NOTHING = {
  available: false,
  version: null,
  sizeBytes: null,
  sha256: null,
  builtAt: null,
  downloadUrl: '/download/nostragoalus.apk',
}

let wrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null

beforeEach(() => {
  // useAsyncData memoizes by key across mounts in one Nuxt app; drop it so each
  // test's stubbed payload is the one that renders.
  clearNuxtData('android-build')
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
})

async function mount(payload: unknown) {
  vi.stubGlobal(
    '$fetch',
    vi.fn(async () => payload),
  )
  wrapper = await mountSuspended(AndroidAppCard)
  return wrapper
}

describe('AndroidAppCard', () => {
  it('offers the download with the build it can be verified against', async () => {
    const c = await mount(PUBLISHED)
    const link = c.find('a[download]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/download/nostragoalus.apk')
    expect(c.text()).toContain('4.7.0')
    expect(c.text()).toContain('60.0 MB')
    // The publish date renders as its ISO day: a locale-formatted one would not
    // survive hydration.
    expect(c.text()).toContain('2026-09-06')
    // Digest grouped in eights, like the client-integrity fingerprint above it.
    expect(c.text()).toContain('abcdef01 23456789')
  })

  it('says nothing is published yet when the deploy has no build', async () => {
    const c = await mount(NOTHING)
    expect(c.find('a[download]').exists()).toBe(false)
    expect(c.text()).toContain('No build is published right now')
  })

  it('falls back to the unavailable state when the read fails', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async () => {
        throw new Error('boom')
      }),
    )
    wrapper = await mountSuspended(AndroidAppCard)
    expect(wrapper.find('a[download]').exists()).toBe(false)
    expect(wrapper.text()).toContain('No build is published right now')
  })

  it('keeps the download but hides the version when the sidecar is missing', async () => {
    const c = await mount({ ...PUBLISHED, version: null, builtAt: null })
    expect(c.find('a[download]').exists()).toBe(true)
    expect(c.text()).not.toContain('Version')
    expect(c.text()).toContain('60.0 MB')
  })
})
