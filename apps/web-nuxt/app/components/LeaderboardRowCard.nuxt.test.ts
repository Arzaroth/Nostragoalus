import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import LeaderboardRowCard from './LeaderboardRowCard.vue'
import { botUserId } from '#shared/types/bot'
import { useSkin } from '../composables/useSkin'
import type { LeaderboardRow } from '../composables/useLeaderboard'

type DisplayRow = LeaderboardRow & { isBot?: boolean; icon?: string }

function row(over: Partial<DisplayRow> = {}): DisplayRow {
  return {
    rank: 1,
    userId: 'u1',
    displayName: 'Alice',
    image: null,
    totalPoints: 42,
    predictionPoints: 42,
    championPoints: 0,
    championCode: null,
    championName: null,
    bestScorerPoints: 0,
    bestScorerName: null,
    bestScorerCode: null,
    livePoints: 0,
    exactCount: 3,
    outcomeCount: 5,
    gdCount: 1,
    showcase: [],
    ...over,
  }
}

let wrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  useSkin().setSkin(null)
})

async function mount(r: DisplayRow, meId?: string) {
  wrapper = await mountSuspended(LeaderboardRowCard, {
    props: { row: r, to: `/wc/users/${r.userId}`, meId },
  })
  return wrapper
}

describe('LeaderboardRowCard', () => {
  it('renders rank, name and points, with no crown/boot/movement on a plain row', async () => {
    const w = await mount(row({ rank: 5 }))
    expect(w.text()).toContain('Alice')
    expect(w.text()).toContain('42')
    expect(w.text()).toContain('5')
    expect(w.find('img[src*="flags-sq-3"]').exists()).toBe(false)
    expect(w.text()).not.toContain('▲')
    expect(w.text()).not.toContain('▼')
  })

  it.each([
    [1, '🥇'],
    [2, '🥈'],
    [3, '🥉'],
  ])('shows the medal for rank %i instead of a bare number', async (rank, medal) => {
    const w = await mount(row({ rank }))
    expect(w.text()).toContain(medal)
  })

  it('appends champion and best-scorer points to the meta line', async () => {
    const w = await mount(row({ championPoints: 10, bestScorerPoints: 5 }))
    expect(w.text()).toContain('👑 +10')
    expect(w.text()).toContain('+5')
  })

  it('renders an up arrow with the gained places when movement is positive', async () => {
    const w = await mount(row({ rank: 6, movement: 2 }))
    expect(w.text()).toContain('▲2')
  })

  it('renders a down arrow when movement is negative', async () => {
    const w = await mount(row({ rank: 6, movement: -3 }))
    expect(w.text()).toContain('▼3')
  })

  it('renders the champion crown flag when a champion pick is present', async () => {
    const w = await mount(row({ championCode: 'FRA', championName: 'France' }))
    expect(w.find('img[src*="FRA"]').exists()).toBe(true)
    expect(w.text()).toContain('👑')
  })

  it('renders the best-scorer boot flag when a golden-boot pick is present', async () => {
    const w = await mount(row({ bestScorerCode: 'BRA' }))
    expect(w.find('img[src*="BRA"]').exists()).toBe(true)
  })

  it('shows live provisional points when the row is counting', async () => {
    const w = await mount(row({ livePoints: 7 }))
    expect(w.text()).toContain('+7')
  })

  it('highlights the viewer with a thicker border when the row is theirs', async () => {
    const w = await mount(row({ userId: 'me' }), 'me')
    expect(w.find('[data-test=leaderboard-row]').attributes('style')).toContain('border-width: 2px')
  })

  it('uses a plain border for other users', async () => {
    const w = await mount(row({ userId: 'u1' }), 'me')
    expect(w.find('[data-test=leaderboard-row]').attributes('style')).toContain('border-width: 1px')
  })

  it('renders a bot ghost with its icon and a dashed border', async () => {
    const w = await mount(row({ isBot: true, icon: '🤖', displayName: 'Consensus' }))
    const style = w.find('[data-test=leaderboard-row]').attributes('style')
    expect(style).toContain('border-style: dashed')
    expect(w.text()).toContain('🤖')
  })

  it('wears the villain avatar in place of the emoji while a skin is active', async () => {
    useSkin().setSkin('twilight')
    const w = await mount(row({ isBot: true, icon: '🤖', userId: botUserId('CONSENSUS'), displayName: 'Consensus' }))
    expect(w.find('img[src="/bots/discord.png"]').exists()).toBe(true)
    expect(w.text()).not.toContain('🤖')
  })

  it('keeps the emoji for a bot ghost when no skin is active', async () => {
    const w = await mount(row({ isBot: true, icon: '⚖️', userId: botUserId('EQUALIZER'), displayName: 'Equalizer' }))
    expect(w.find('img[src^="/bots/"]').exists()).toBe(false)
    expect(w.text()).toContain('⚖️')
  })
})
