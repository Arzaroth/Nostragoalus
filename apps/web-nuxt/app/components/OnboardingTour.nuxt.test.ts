import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import OnboardingTour from './OnboardingTour.vue'
import { TOUR_STEPS } from '../composables/useOnboardingTour'

const active = ref(true)
const stepIndex = ref(0)
const canAutoStart = ref(false)
const start = vi.fn()
const skip = vi.fn()
function next() {
  stepIndex.value++
}
function prev() {
  stepIndex.value--
}

mockNuxtImport('useOnboardingTour', () => () => ({
  active,
  stepIndex,
  canAutoStart,
  steps: TOUR_STEPS,
  start,
  next,
  prev,
  skip,
}))

const mounted: Array<{ unmount: () => void }> = []
async function mount() {
  const wrapper = await mountSuspended(OnboardingTour)
  mounted.push(wrapper)
  await nextTick()
  return wrapper
}

beforeEach(() => {
  active.value = true
  stepIndex.value = 0
  canAutoStart.value = false
  start.mockClear()
  skip.mockClear()
})
afterEach(() => {
  // Unmount before clearing the body: the overlay teleports there.
  while (mounted.length) mounted.pop()!.unmount()
  document.body.innerHTML = ''
})

describe('OnboardingTour', () => {
  it('renders the welcome step when active', async () => {
    await mount()
    expect(document.body.textContent).toContain('Welcome to Nostragoalus!')
    expect(document.body.textContent).toContain(`1 / ${TOUR_STEPS.length}`)
  })

  it('renders nothing when inactive', async () => {
    active.value = false
    await mount()
    expect(document.body.textContent).not.toContain('Welcome to Nostragoalus!')
  })

  it('hides Back on the first step and shows the Next label', async () => {
    await mount()
    const labels = Array.from(document.body.querySelectorAll('button')).map((b) => b.textContent?.trim())
    expect(labels).toContain('Next')
    expect(labels).not.toContain('Back')
  })

  it('shows Back and the Done label on the last (centered) step', async () => {
    stepIndex.value = TOUR_STEPS.length - 1
    await mount()
    const labels = Array.from(document.body.querySelectorAll('button')).map((b) => b.textContent?.trim())
    expect(labels).toContain('Back')
    expect(labels).toContain('Got it')
    expect(document.body.textContent).toContain("You're all set!")
  })

  it('skip button dismisses the tour', async () => {
    await mount()
    const btn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes('Skip tour'))
    expect(btn).toBeTruthy()
    btn!.click()
    expect(skip).toHaveBeenCalled()
  })

  it('auto-starts when the gate opens', async () => {
    await mount()
    canAutoStart.value = true
    await nextTick()
    expect(start).toHaveBeenCalled()
  })
})
