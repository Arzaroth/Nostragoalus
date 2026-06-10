import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import CrowdLine from './CrowdLine.vue'

const totals = { m1: { home: 7, away: 2, count: 3 } }
const leagueTotals = { m1: { home: 3, away: 2, count: 2 } }

describe('CrowdLine', () => {
  it('shows the global total only when no league is active', async () => {
    const wrapper = await mountSuspended(CrowdLine, { props: { matchId: 'm1', totals, count: true } })
    expect(wrapper.text()).toContain('7–2 (3)')
    expect(wrapper.text()).not.toContain('🌐')
  })

  it('shows league first and global second when a league is active', async () => {
    const wrapper = await mountSuspended(CrowdLine, {
      props: { matchId: 'm1', totals, leagueTotals, leagueActive: true, count: true },
    })
    expect(wrapper.text()).toContain('3–2 (2)')
    expect(wrapper.text()).toContain('🌐 7–2 (3)')
  })

  it('renders dashes for matches without predictions and hides counts without the flag', async () => {
    const wrapper = await mountSuspended(CrowdLine, {
      props: { matchId: 'm9', totals, leagueTotals, leagueActive: true },
    })
    expect(wrapper.text()).toContain('–')
    expect(wrapper.text()).not.toContain('(')
  })

  it('prefixes the crowd label when asked', async () => {
    const wrapper = await mountSuspended(CrowdLine, { props: { matchId: 'm1', totals, label: true } })
    expect(wrapper.text()).toMatch(/👥 .+: 7–2/)
  })
})
