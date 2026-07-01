import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import MultiviewCellTile from './CellTile.vue'

const detail = ref<any>({ minute: "67'", goals: [{ side: 'HOME', playerName: 'Kylian MBAPPÉ', minute: "23'" }] })
const events = ref<any[]>([{ kind: 'goal', side: 'HOME', minute: "23'", playerName: 'Kylian MBAPPÉ', homeScore: 1, awayScore: 0 }])

mockNuxtImport('useMatchLiveDetail', () => () => ({ data: detail }))
mockNuxtImport('useMatchTimeline', () => () => ({ data: events }))

const liveMatch = { id: 'm1', status: 'LIVE', fullTimeHome: 2, fullTimeAway: 1, homeTeamCode: 'FRA', awayTeamCode: 'ARG', homeTeam: 'France', awayTeam: 'Argentina' } as any

describe('MultiviewCellTile', () => {
  it('shows the live score, clock and goal-scorer chips', async () => {
    const c = await mountSuspended(MultiviewCellTile, { props: { matchId: 'm1', match: liveMatch } })
    const text = c.text()
    expect(text).toContain('2')
    expect(text).toContain('1')
    expect(text).toContain("67'")
    expect(text).toContain('Kylian Mbappé')
  })

  it('renders the play-by-play only when focused', async () => {
    const unfocused = await mountSuspended(MultiviewCellTile, { props: { matchId: 'm1', match: liveMatch, focused: false } })
    expect(unfocused.findComponent({ name: 'MatchPlayByPlay' }).exists()).toBe(false)

    const focused = await mountSuspended(MultiviewCellTile, { props: { matchId: 'm1', match: liveMatch, focused: true } })
    expect(focused.findComponent({ name: 'MatchPlayByPlay' }).exists()).toBe(true)
    expect(focused.text()).toContain('scores')
  })
})
