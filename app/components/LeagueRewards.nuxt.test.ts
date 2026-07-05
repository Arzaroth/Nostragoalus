import { afterEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { RewardStandingDto } from '#shared/types/rewards'
import LeagueRewards from './LeagueRewards.vue'

const standingsData = ref<RewardStandingDto[]>([])
mockNuxtImport('useLeagueRewards', () => () => ({
  standings: { data: standingsData, isLoading: ref(false) },
  save: { mutateAsync: async () => ({ ok: true }), isPending: ref(false) },
}))
mockNuxtImport('useLeagueActions', () => () => ({
  update: { mutateAsync: async () => ({ ok: true }), isPending: ref(false) },
}))

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
  document.body.innerHTML = ''
})

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
})
