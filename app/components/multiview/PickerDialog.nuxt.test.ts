import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import MultiviewPickerDialog from './PickerDialog.vue'

const matches = ref<any[]>([
  { id: 'm1', status: 'LIVE', kickoffTime: '2026-06-12T18:00:00Z', homeTeam: 'France', awayTeam: 'Argentina', homeTeamCode: 'FRA', awayTeamCode: 'ARG', fullTimeHome: 1, fullTimeAway: 0, group: 'A' },
  { id: 'm2', status: 'SCHEDULED', kickoffTime: '2026-06-13T18:00:00Z', homeTeam: 'Spain', awayTeam: 'Italy', homeTeamCode: 'ESP', awayTeamCode: 'ITA', fullTimeHome: null, fullTimeAway: null, group: 'B' },
  { id: 'm3', status: 'FINISHED', kickoffTime: '2026-06-11T18:00:00Z', homeTeam: 'Brazil', awayTeam: 'Germany', homeTeamCode: 'BRA', awayTeamCode: 'GER', fullTimeHome: 2, fullTimeAway: 1, group: 'C' },
])

mockNuxtImport('useMatches', () => () => ({ data: matches }))

async function open() {
  return mountSuspended(MultiviewPickerDialog, { props: { visible: true } })
}

describe('MultiviewPickerDialog', () => {
  it('lists the matches and selecting one emits select + closes', async () => {
    const wrapper = await open()
    const body = document.body.textContent ?? ''
    expect(body).toContain('France')
    expect(body).toContain('Spain')
    expect(body).toContain('Brazil')

    const rows = Array.from(document.body.querySelectorAll('button')).filter((b) => b.textContent?.includes('France'))
    rows[0]!.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('select')?.[0]).toEqual(['m1'])
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false])
  })

  it('does not select a disabled (already-added) match', async () => {
    const wrapper = await mountSuspended(MultiviewPickerDialog, { props: { visible: true, disabledIds: ['m1'] } })
    const rows = Array.from(document.body.querySelectorAll('button')).filter((b) => b.textContent?.includes('France'))
    rows[0]!.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('select')).toBeUndefined()
  })
})
