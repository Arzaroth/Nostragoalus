import { afterEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { RewardRankingDto } from '#shared/types/rewards'
import RewardRankingDialog from './RewardRankingDialog.vue'

const data = ref<RewardRankingDto | undefined>(undefined)
const isLoading = ref(false)
mockNuxtImport('useRewardRanking', () => () => ({ data, isLoading }))

afterEach(() => {
  data.value = undefined
  isLoading.value = false
  document.body.innerHTML = ''
})

function mount() {
  return mountSuspended(RewardRankingDialog, {
    props: { leagueId: 'lg1', type: 'OVERALL' as const, visible: true },
  })
}

describe('RewardRankingDialog', () => {
  it('renders the ranking rows with the points metric and highlights the viewer', async () => {
    data.value = {
      type: 'OVERALL',
      teamCode: null,
      reward: { type: 'OVERALL', label: 'A magnum', imageUrl: null, note: null, link: null },
      metric: 'points',
      rows: [
        { rank: 1, userId: 'a', displayName: 'Alice', image: null, value: 8, isViewer: false },
        { rank: 2, userId: 'b', displayName: 'Bob', image: null, value: 5, isViewer: true },
      ],
    }
    const w = await mount()
    const body = document.body.textContent ?? ''
    expect(body).toContain('A magnum')
    expect(body).toContain('Alice')
    expect(body).toContain('Bob')
    expect(body).toContain('8')
    w.unmount()
  })

  it('shows the empty state when nobody has scored', async () => {
    data.value = { type: 'GROUP_PHASE', teamCode: null, reward: null, metric: 'points', rows: [] }
    const w = await mount()
    expect(document.body.textContent ?? '').toContain('No ranking yet')
    w.unmount()
  })

  it('masks a concealed member with the hidden-player placeholder', async () => {
    data.value = {
      type: 'OVERALL',
      teamCode: null,
      reward: null,
      metric: 'points',
      rows: [{ rank: 1, userId: 'a', displayName: '', image: null, value: 3, isViewer: false }],
    }
    const w = await mount()
    expect(document.body.textContent ?? '').toContain('A hidden player')
    w.unmount()
  })
})
