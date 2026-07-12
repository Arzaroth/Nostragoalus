import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MatchPlayByPlay from './PlayByPlay.vue'

const goal = { kind: 'goal', side: 'HOME', minute: "23'", playerName: 'Kylian MBAPPÉ', homeScore: 1, awayScore: 0 }

describe('MatchPlayByPlay', () => {
  it('shows the empty message when there are no events', async () => {
    const c = await mountSuspended(MatchPlayByPlay, { props: { events: [] } })
    expect(c.text()).toContain('No play-by-play for this match yet.')
  })

  it('renders skeletons while pending with no events yet', async () => {
    const c = await mountSuspended(MatchPlayByPlay, { props: { events: [], pending: true } })
    expect(c.findAll('.p-skeleton').length).toBeGreaterThan(0)
    expect(c.text()).not.toContain('No play-by-play')
  })

  it('renders a goal row with the title-cased scorer and running score', async () => {
    const c = await mountSuspended(MatchPlayByPlay, {
      props: { events: [goal], homeCode: 'FRA', awayCode: 'ARG' },
    })
    const text = c.text()
    expect(text).toContain('Kylian Mbappé scores')
    expect(text).toContain("23'")
    expect(text).toContain('1–0')
  })

  it('surfaces the half-time marker for break subs and localizes VAR', async () => {
    const c = await mountSuspended(MatchPlayByPlay, {
      props: {
        events: [
          { kind: 'sub', side: 'AWAY', minute: '', playerInName: 'A', playerOutName: 'B' },
          { kind: 'var', side: null, minute: "70'", text: null },
        ],
      },
    })
    expect(c.text()).toContain('HT')
    expect(c.text()).toContain('VAR')
  })
})
