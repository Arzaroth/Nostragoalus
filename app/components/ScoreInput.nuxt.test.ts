import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, ref } from 'vue'
import ScoreInput from './ScoreInput.vue'

// Two stacked inputs mimic a matchday list: keyboard advance must hop
// home -> away -> next match's home.
const Pair = defineComponent({
  components: { ScoreInput },
  setup() {
    const updates = ref<{ home: number; away: number }[]>([])
    return { updates }
  },
  template: `
    <div>
      <ScoreInput :home="null" :away="null" @update="updates.push($event)" />
      <ScoreInput :home="null" :away="null" @update="updates.push($event)" />
    </div>
  `,
})

async function mountPair() {
  const wrapper = await mountSuspended(Pair, { attachTo: document.body })
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input.ng-score-input'))
  expect(inputs).toHaveLength(4)
  return { wrapper, inputs }
}

describe('ScoreInput keyboard advance', () => {
  it('Enter moves home -> away -> next component home', async () => {
    const { wrapper, inputs } = await mountPair()
    inputs[0].focus()
    inputs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(inputs[1])
    inputs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(inputs[2])
    wrapper.unmount()
  })

  it('Space advances too and commits a complete score', async () => {
    const { wrapper, inputs } = await mountPair()
    const scores = wrapper.findAllComponents(ScoreInput)
    await scores[0].find('input').setValue('2')

    // Drive the away value through the component state (InputNumber parsing
    // is irrelevant here), then advance with space from the away input.
    const vm = scores[0].vm as unknown as { home: number | null; away: number | null }
    vm.home = 2
    vm.away = 1
    inputs[1].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(inputs[2])
    expect(scores[0].emitted('update')).toBeTruthy()
    expect(scores[0].emitted('update')![0][0]).toEqual({ home: 2, away: 1 })
    wrapper.unmount()
  })

  it('blurs at the end of the list instead of wrapping', async () => {
    const { wrapper, inputs } = await mountPair()
    inputs[3].focus()
    inputs[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(document.activeElement).not.toBe(inputs[3])
    wrapper.unmount()
  })
})
