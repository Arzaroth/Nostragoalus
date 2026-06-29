import { describe, it, expect, afterEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, ref, nextTick } from 'vue'
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

// One match's inputs, with a parent that records the saved scores - mirrors the
// keyboard-advance harness above so findComponent/emitted behave the same.
const Single = defineComponent({
  components: { ScoreInput },
  setup() {
    const updates = ref<{ home: number; away: number }[]>([])
    return { updates }
  },
  template: `<div><ScoreInput :home="null" :away="null" @update="updates.push($event)" /></div>`,
})

describe('ScoreInput outlandish confirm', () => {
  // The confirm Dialog teleports to body, so unmount and clear it between cases.
  const mounted: Array<{ unmount: () => void }> = []
  afterEach(() => {
    while (mounted.length) mounted.pop()!.unmount()
    document.body.innerHTML = ''
  })

  async function mountOne() {
    const wrapper = await mountSuspended(Single, { attachTo: document.body })
    mounted.push(wrapper)
    const cmp = wrapper.findComponent(ScoreInput)
    const vm = cmp.vm as unknown as { home: number | null; away: number | null }
    return { wrapper, cmp, vm }
  }
  function findButton(text: string) {
    return Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim().includes(text))
  }
  // Target this component's own input - prior tests leave detached inputs in the
  // body, so a bare document.querySelector would hit a stale one. Await a render
  // tick first so the InputNumber has the new model value before it's focused.
  async function commitViaEnter(cmp: { find: (sel: string) => { element: Element } }) {
    await nextTick()
    const input = cmp.find('input.ng-score-input').element as HTMLInputElement
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  }

  it('holds an outlandish score behind a confirm, then saves on accept', async () => {
    const { cmp, vm } = await mountOne()
    vm.home = 1
    vm.away = 33
    await commitViaEnter(cmp)
    await nextTick()
    // Nothing saved while the confirm is up.
    expect(cmp.emitted('update')).toBeFalsy()
    const accept = findButton('Save anyway')
    expect(accept).toBeTruthy()
    accept!.click()
    await nextTick()
    expect(cmp.emitted('update')![0][0]).toEqual({ home: 1, away: 33 })
  })

  it('reverts and does not save when the confirm is cancelled', async () => {
    const { cmp, vm } = await mountOne()
    vm.home = 9
    vm.away = 0
    await commitViaEnter(cmp)
    await nextTick()
    const cancel = findButton('Cancel')
    expect(cancel).toBeTruthy()
    cancel!.click()
    await nextTick()
    expect(cmp.emitted('update')).toBeFalsy()
    expect(vm.home).toBe(null)
    expect(vm.away).toBe(null)
  })

  it('auto-saves a plausible score without a confirm', async () => {
    const { cmp, vm } = await mountOne()
    vm.home = 3
    vm.away = 2
    await commitViaEnter(cmp)
    await nextTick()
    expect(findButton('Save anyway')).toBeFalsy()
    expect(cmp.emitted('update')![0][0]).toEqual({ home: 3, away: 2 })
  })
})
