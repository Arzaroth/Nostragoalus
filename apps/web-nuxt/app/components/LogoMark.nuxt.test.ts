import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import LogoMark from './LogoMark.vue'

const skin = ref<string | null>(null)
const sport = ref('FOOTBALL')

mockNuxtImport('useSkin', () => () => ({ skin }))
mockNuxtImport('useSelectedSport', () => () => sport)

const mounted: Array<{ unmount: () => void }> = []
async function mount() {
  const w = await mountSuspended(LogoMark)
  mounted.push(w)
  return w
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  skin.value = null
  sport.value = 'FOOTBALL'
  vi.unstubAllGlobals()
})

// The football mark draws its panels as polygons; the rugby one draws the ball
// as an ellipse with a lacing group. That is the cheapest honest tell apart.
const isRugby = (html: string) => html.includes('rx="62"') && html.includes('ry="38"')

describe('LogoMark', () => {
  it('shows the football mark for a football competition', async () => {
    const w = await mount()
    expect(isRugby(w.html())).toBe(false)
  })

  it('swaps the ball for a rugby competition', async () => {
    sport.value = 'RUGBY_UNION'
    const w = await mount()
    expect(isRugby(w.html())).toBe(true)
  })

  it('lets an unlocked skin win over the sport', async () => {
    // The skin is something the user went looking for; which tournament they
    // happen to be viewing should not quietly undo it.
    skin.value = 'twilight'
    sport.value = 'RUGBY_UNION'
    const w = await mount()
    expect(isRugby(w.html())).toBe(false)
    expect(w.html()).toContain('svg')
  })

  it('treats an unknown sport as football rather than rendering nothing', async () => {
    sport.value = 'CURLING'
    const w = await mount()
    expect(isRugby(w.html())).toBe(false)
    expect(w.html()).toContain('svg')
  })
})
