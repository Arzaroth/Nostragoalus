import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MatchLineups from './MatchLineups.vue'
import type { MatchLineups as MatchLineupsType, SquadPlayer } from '#shared/types/match'

const p = (over: Partial<SquadPlayer> & { playerId: string; name: string }): SquadPlayer => ({
  shirtNumber: null,
  position: null,
  captain: false,
  pictureUrl: null,
  ...over,
})

const lineups: MatchLineupsType = {
  available: true,
  home: {
    formation: '4-3-3',
    coach: 'Rafael MARQUEZ',
    startingXI: [
      p({ playerId: 'gk', name: 'Keeper One', shirtNumber: 1, position: 'GK', captain: true, pictureUrl: 'gk.png' }),
      p({ playerId: 'd', name: 'Back Four', shirtNumber: 4, position: 'DF' }),
      p({ playerId: 'm', name: 'Mid Eight', shirtNumber: 8, position: 'MF' }),
      p({ playerId: 'f', name: 'Front Nine', shirtNumber: 9, position: 'FW' }),
      p({ playerId: 'u', name: 'No Slot', shirtNumber: 6, position: null }),
    ],
    bench: [p({ playerId: 's', name: 'Sub Twelve', shirtNumber: 12, position: 'GK', captain: true })],
  },
  away: {
    formation: null,
    coach: null,
    startingXI: [p({ playerId: 'a', name: 'Away Keeper', shirtNumber: 1, position: 'GK' })],
    bench: [],
  },
}

let mounted: Array<{ unmount: () => void }> = []
afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
})

async function mount() {
  const wrapper = await mountSuspended(MatchLineups, {
    props: { lineups, home: 'Mexico', away: 'South Africa', homeCode: 'MEX', awayCode: 'RSA', slug: 'wc' },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('MatchLineups', () => {
  it('renders the XI, bench, coach and formation for both sides', async () => {
    const wrapper = await mount()
    const text = wrapper.text()
    expect(text).toContain('Keeper One')
    expect(text).toContain('No Slot')
    expect(text).toContain('Sub Twelve')
    expect(text).toContain('4-3-3')
    expect(text).toContain('Rafael MARQUEZ')
    expect(text).toContain('Away Keeper')
  })

  it('links each team to its team page when a code is present', async () => {
    const wrapper = await mount()
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(hrefs).toContain('/wc/teams/MEX')
    expect(hrefs).toContain('/wc/teams/RSA')
  })

  it('shows the headshot when present and a numbered chip otherwise', async () => {
    const wrapper = await mount()
    const imgs = wrapper.findAll('img').map((i) => i.attributes('src'))
    expect(imgs).toContain('gk.png')
    // The away keeper has no picture, so its chip falls back to the shirt number.
    expect(wrapper.text()).toContain('1')
  })

  it('marks the captain', async () => {
    const wrapper = await mount()
    // Pitch captain badge plus the bench captain glyph.
    expect(wrapper.html()).toContain('>C<')
    expect(wrapper.text()).toContain('©')
  })

  it('places the XI absolutely on a pitch when every starter has coordinates', async () => {
    const placedLineups: MatchLineupsType = {
      available: true,
      home: {
        formation: '1-1',
        coach: null,
        startingXI: [
          p({ playerId: 'g', name: 'Keeper', shirtNumber: 1, position: 'GK', x: 50, y: 7 }),
          p({ playerId: 'd', name: 'Defender', shirtNumber: 2, position: 'DF', x: 50, y: 24 }),
          p({ playerId: 'f', name: 'Forward', shirtNumber: 9, position: 'FW', x: 50, y: 92 }),
        ],
        bench: [],
      },
      away: { formation: null, coach: null, startingXI: [], bench: [] },
    }
    const wrapper = await mountSuspended(MatchLineups, { props: { lineups: placedLineups, home: 'A', away: 'B', slug: 'wc' } })
    mounted.push(wrapper)
    expect(wrapper.find('svg.pitch-half').exists()).toBe(true)
    expect(wrapper.html()).toContain('bottom: 92%') // the forward, placed by coordinate
    expect(wrapper.text()).toContain('Forward')
  })
})
