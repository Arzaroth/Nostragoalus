import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MatchReactionsLine from './MatchReactionsLine.vue'
import { emptyReactionTotals, type ReactionTotals } from '#shared/reactions'

// Skin defaults to null (un-skinned) so the palette renders as emoji; one test
// flips it on to check the pony-face swap.
vi.mock('../composables/useSkin', async () => {
  const { ref } = await import('vue')
  const skin = ref<string | null>(null)
  return { useSkin: () => ({ skin }), __skin: skin }
})
async function setSkin(v: string | null) {
  ;((await import('../composables/useSkin')) as any).__skin.value = v
}

function totalsFor(over: Partial<ReactionTotals>): Record<string, ReactionTotals> {
  return { m1: { ...emptyReactionTotals(), ...over } }
}

let mounted: Array<{ unmount: () => void }> = []
beforeEach(async () => {
  await setSkin(null)
})
afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
})

async function mount(props: Record<string, unknown>) {
  const wrapper = await mountSuspended(MatchReactionsLine, {
    props: { matchId: 'm1', totals: {}, ...props },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('MatchReactionsLine', () => {
  it('renders only the emojis that have a count', async () => {
    const wrapper = await mount({ totals: totalsFor({ FIRE: 3, WOW: 1 }) })
    expect(wrapper.text()).toContain('🔥')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('😮')
    expect(wrapper.text()).toContain('1')
    // Zero-count emoji are left out.
    expect(wrapper.text()).not.toContain('⚽')
    expect(wrapper.text()).not.toContain('😡')
  })

  it('renders nothing when the match has no reactions', async () => {
    const wrapper = await mount({ totals: totalsFor({}) })
    expect(wrapper.text()).toBe('')
    const unknown = await mount({ totals: {} })
    expect(unknown.text()).toBe('')
  })

  it('highlights the caller own reaction', async () => {
    const wrapper = await mount({ totals: totalsFor({ FIRE: 2, WOW: 1 }), mine: { m1: 'FIRE' } })
    const highlighted = wrapper.find('.font-bold')
    expect(highlighted.exists()).toBe(true)
    expect(highlighted.text()).toContain('🔥')
  })

  it('shows the league counts and the global total under a league lens', async () => {
    const wrapper = await mount({
      totals: totalsFor({ FIRE: 5 }),
      leagueTotals: totalsFor({ FIRE: 2 }),
      leagueActive: true,
    })
    // League scope: FIRE shows the league count (2), and the global grand total
    // (5) rides along behind the globe.
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('🌐')
    expect(wrapper.text()).toContain('5')
  })

  it('swaps the emoji for pony faces when a skin is active', async () => {
    await setSkin('pinkie')
    const wrapper = await mount({ totals: totalsFor({ FIRE: 1, LAUGH: 2 }) })
    const srcs = wrapper.findAll('img').map((i) => i.attributes('src'))
    expect(srcs).toContain('/skins/rainbow.png') // FIRE
    expect(srcs).toContain('/skins/pinkie.png') // LAUGH
    expect(wrapper.text()).not.toContain('🔥')
  })
})
