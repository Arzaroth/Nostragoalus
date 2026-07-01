import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import MultiviewGrid from './Grid.vue'
import MultiviewCell from './Cell.vue'
import MultiviewSlotEmpty from './SlotEmpty.vue'

const matches = ref<any[]>([
  { id: 'm1', status: 'SCHEDULED', kickoffTime: '2026-06-12T18:00:00Z', homeTeam: 'France', awayTeam: 'Argentina', homeTeamCode: 'FRA', awayTeamCode: 'ARG', fullTimeHome: null, fullTimeAway: null },
  { id: 'm2', status: 'SCHEDULED', kickoffTime: '2026-06-13T18:00:00Z', homeTeam: 'Spain', awayTeam: 'Italy', homeTeamCode: 'ESP', awayTeamCode: 'ITA', fullTimeHome: null, fullTimeAway: null },
])

mockNuxtImport('useMatches', () => () => ({ data: matches }))
mockNuxtImport('useLiveMatches', () => () => {})

describe('MultiviewGrid', () => {
  it('renders a cell per filled slot and an empty placeholder for the rest', async () => {
    const c = await mountSuspended(MultiviewGrid, { props: { cells: ['m1', 'm2'], layout: '2x2', focusedId: null } })
    expect(c.findAllComponents(MultiviewCell)).toHaveLength(2)
    expect(c.findAllComponents(MultiviewSlotEmpty)).toHaveLength(2)
    expect(c.text()).toContain('France')
    expect(c.text()).toContain('Spain')
  })

  it('emits add from an empty slot and focus from a filled cell', async () => {
    const c = await mountSuspended(MultiviewGrid, { props: { cells: ['m1'], layout: '2x1', focusedId: null } })
    await c.findComponent(MultiviewSlotEmpty).find('button').trigger('click')
    expect(c.emitted('add')).toBeTruthy()

    await c.findComponent(MultiviewCell).trigger('click')
    expect(c.emitted('focus')?.[0]).toEqual(['m1'])
  })
})
