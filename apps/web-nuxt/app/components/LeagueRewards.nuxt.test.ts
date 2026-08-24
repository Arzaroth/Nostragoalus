import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { RewardStandingDto } from '#shared/types/rewards'
import LeagueRewards from './LeagueRewards.vue'

const standingsData = ref<RewardStandingDto[]>([])
const exportWinners = vi.fn(async () => 1)
const toastAdd = vi.fn()
mockNuxtImport('useLeagueRewards', () => () => ({
  standings: { data: standingsData, isLoading: ref(false) },
  save: { mutateAsync: async () => ({ ok: true }), isPending: ref(false) },
  exportWinners,
  exporting: ref(false),
}))
mockNuxtImport('useLeagueActions', () => () => ({
  update: { mutateAsync: async () => ({ ok: true }), isPending: ref(false) },
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

function standing(over: Partial<RewardStandingDto>): RewardStandingDto {
  return {
    type: 'OVERALL',
    reward: null,
    winners: [],
    value: 0,
    metric: 'points',
    teamCode: null,
    disabled: false,
    youHold: false,
    ...over,
  }
}

afterEach(() => {
  standingsData.value = []
  exportWinners.mockClear()
  toastAdd.mockClear()
  document.body.innerHTML = ''
})

const magnum = () =>
  standing({ type: 'OVERALL', reward: { type: 'OVERALL', label: 'A magnum', imageUrl: null, note: null, link: null } })

describe('LeagueRewards', () => {
  it('shows configured prizes with their criterion name', async () => {
    standingsData.value = [
      standing({ type: 'OVERALL', reward: { type: 'OVERALL', label: 'A magnum', imageUrl: null, note: null, link: null } }),
      standing({ type: 'WOODEN_SPOON', reward: { type: 'WOODEN_SPOON', label: 'A lemon', imageUrl: null, note: null, link: null } }),
    ]
    const w = await mountSuspended(LeagueRewards, { props: { leagueId: 'lg1', canManage: false } })
    const text = w.text()
    expect(text).toContain('A magnum')
    expect(text).toContain('Overall Winner')
    expect(text).toContain('A lemon')
    expect(text).toContain('Wooden Spoon')
    w.unmount()
  })

  it('offers the manager an edit control and a no-prizes prompt when empty', async () => {
    standingsData.value = []
    const w = await mountSuspended(LeagueRewards, { props: { leagueId: 'lg1', canManage: true } })
    expect(w.text()).toContain('No prizes yet')
    expect(w.text()).toContain('Edit prizes')
    w.unmount()
  })

  it('exports the winners for a manager, and keeps the control from members', async () => {
    standingsData.value = [magnum()]
    const member = await mountSuspended(LeagueRewards, { props: { leagueId: 'lg1', canManage: false } })
    expect(member.text()).not.toContain('Export winners')
    member.unmount()

    const w = await mountSuspended(LeagueRewards, { props: { leagueId: 'lg1', canManage: true } })
    const button = w.findAll('button').find((b) => b.text().includes('Export winners'))!
    expect(button).toBeTruthy()
    await button.trigger('click')
    expect(exportWinners).toHaveBeenCalled()
    expect(toastAdd).not.toHaveBeenCalled()
    w.unmount()
  })

  it('hides the export control while the league has no prize to hand over', async () => {
    standingsData.value = []
    const w = await mountSuspended(LeagueRewards, { props: { leagueId: 'lg1', canManage: true } })
    expect(w.text()).not.toContain('Export winners')
    w.unmount()
  })

  it('says so rather than downloading an empty file when nobody holds a prize', async () => {
    standingsData.value = [magnum()]
    exportWinners.mockResolvedValueOnce(0)
    const w = await mountSuspended(LeagueRewards, { props: { leagueId: 'lg1', canManage: true } })
    await w.findAll('button').find((b) => b.text().includes('Export winners'))!.trigger('click')
    await nextTick()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'info', summary: 'No prize has a holder yet.' }))
    w.unmount()
  })

  it('toasts an error when the export fails', async () => {
    standingsData.value = [magnum()]
    exportWinners.mockRejectedValueOnce(new Error('boom'))
    const w = await mountSuspended(LeagueRewards, { props: { leagueId: 'lg1', canManage: true } })
    await w.findAll('button').find((b) => b.text().includes('Export winners'))!.trigger('click')
    await nextTick()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', summary: 'Could not export the winners.' }))
    w.unmount()
  })
})
