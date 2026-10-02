import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useCompetitionMeta, useLastCompetition } from './useCompetitions'

const META = { slugs: ['world-cup-2026', 'euro-2028'], defaultSlug: 'world-cup-2026', sportBySlug: {} }

function setCookie(v: string | null) {
  document.cookie = v === null ? 'ng-competition=; max-age=0; path=/' : `ng-competition=${v}; path=/`
}

const mounted: Array<{ unmount: () => void }> = []

async function setup(meta: typeof META | null) {
  let last!: ReturnType<typeof useLastCompetition>
  const wrapper = await mountSuspended({
    setup() {
      useCompetitionMeta().value = meta
      last = useLastCompetition()
      return () => null
    },
  })
  mounted.push(wrapper)
  return last
}

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  setCookie(null)
})

describe('useLastCompetition', () => {
  it('returns the remembered competition while it is still active', async () => {
    setCookie('euro-2028')
    const last = await setup(META)
    expect(last.value).toBe('euro-2028')
  })

  it('falls back to the default once the remembered competition is archived', async () => {
    setCookie('club-cup-2025')
    const last = await setup(META)
    expect(last.value).toBe('world-cup-2026')
  })

  it('stops trusting the cookie as soon as the meta drops its slug', async () => {
    setCookie('euro-2028')
    const last = await setup(META)
    useCompetitionMeta().value = { ...META, slugs: ['world-cup-2026'] }
    expect(last.value).toBe('world-cup-2026')
  })

  it('trusts the cookie when the meta never resolved', async () => {
    setCookie('club-cup-2025')
    const last = await setup(null)
    expect(last.value).toBe('club-cup-2025')
  })

  it('writes through to the cookie', async () => {
    const last = await setup(META)
    last.value = 'euro-2028'
    await nextTick()
    expect(document.cookie).toContain('ng-competition=euro-2028')
  })
})
