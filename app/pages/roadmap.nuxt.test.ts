import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RoadmapPage from './roadmap.vue'

// Real refs the tests mutate before mounting (the harness can't resolve the real
// reactive auth source), mirroring ReactionBar's approach.
vi.mock('../composables/useAuth', async () => {
  const { ref } = await import('vue')
  const signed = ref(true)
  return {
    useAuth: () => ({ session: ref(signed.value ? { data: { user: { id: 'u1' } } } : { data: null }) }),
    __signed: signed,
  }
})

// Stub the data + actions layer: keep the real groupByStatus, swap the query and
// mutations for controllable fakes so the test drives rendering and interaction.
vi.mock('../composables/useRoadmap', async () => {
  const actual = await vi.importActual<any>('../composables/useRoadmap')
  const { ref } = await import('vue')
  const items = ref<any[]>([])
  const voteMutate = vi.fn()
  const submitMutate = vi.fn()
  return {
    ...actual,
    useRoadmap: () => ({ data: items, isPending: ref(false), isError: ref(false) }),
    useRoadmapActions: () => ({
      submit: { mutate: submitMutate, isPending: ref(false) },
      vote: { mutate: voteMutate, isPending: ref(false) },
    }),
    __items: items,
    __voteMutate: voteMutate,
    __submitMutate: submitMutate,
  }
})

async function authMod() {
  return (await import('../composables/useAuth')) as any
}
async function roadmapMod() {
  return (await import('../composables/useRoadmap')) as any
}

const IN_PROGRESS = { id: 'a', title: 'Live scores', description: null, status: 'IN_PROGRESS', position: 0, voteCount: 3, viewerHasVoted: false, underReview: false, updatedAt: '' }
const SUGGESTION = { id: 's', title: 'Dark mode', description: 'please', status: 'SUGGESTED', position: 0, voteCount: 7, viewerHasVoted: true, underReview: true, updatedAt: '' }

beforeEach(async () => {
  ;(await authMod()).__signed.value = true
  const m = await roadmapMod()
  m.__items.value = [IN_PROGRESS, SUGGESTION]
  m.__voteMutate.mockClear()
  m.__submitMutate.mockClear()
})

let mounted: Array<{ unmount: () => void }> = []
afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
})

async function mount() {
  const wrapper = await mountSuspended(RoadmapPage)
  mounted.push(wrapper)
  return wrapper
}

describe('roadmap page', () => {
  it('renders roadmap items, the community section and vote counts', async () => {
    const wrapper = await mount()
    expect(wrapper.text()).toContain('Live scores')
    expect(wrapper.text()).toContain('Community suggestions')
    expect(wrapper.text()).toContain('Dark mode')
    // The pending suggestion is flagged under review.
    expect(wrapper.text()).toContain('Under review')
    // One vote button per item.
    expect(wrapper.findAll('button.ng-vote')).toHaveLength(2)
    // The suggestion the viewer voted for is marked pressed.
    const suggestionVote = wrapper.findAll('button.ng-vote').find((b) => b.attributes('aria-pressed') === 'true')
    expect(suggestionVote).toBeTruthy()
  })

  it('toggles an upvote when signed in', async () => {
    const wrapper = await mount()
    // Vote on the In-progress card specifically (column order is board-defined).
    const card = wrapper.findAll('.ng-roadmap-card').find((c) => c.text().includes('Live scores'))!
    await card.find('button.ng-vote').trigger('click')
    const m = await roadmapMod()
    expect(m.__voteMutate).toHaveBeenCalledWith('a')
  })

  it('submits a suggestion through the form', async () => {
    const wrapper = await mount()
    await wrapper.find('form input').setValue('My great idea')
    await wrapper.find('form').trigger('submit')
    const m = await roadmapMod()
    expect(m.__submitMutate).toHaveBeenCalled()
    expect(m.__submitMutate.mock.calls[0][0]).toMatchObject({ title: 'My great idea' })
  })

  it('hides the form and does not vote when signed out', async () => {
    ;(await authMod()).__signed.value = false
    const wrapper = await mount()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Sign in to suggest')
    await wrapper.findAll('button.ng-vote')[0].trigger('click')
    const m = await roadmapMod()
    expect(m.__voteMutate).not.toHaveBeenCalled()
  })
})
