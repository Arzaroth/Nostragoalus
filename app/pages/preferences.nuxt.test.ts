import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import Preferences from './preferences.vue'

const session = ref<{ data: { user: Record<string, unknown> } | null }>({ data: { user: { id: 'u1' } } })
const updateUser = vi.fn(async () => ({}))
const skin = ref<string | null>(null)
const unlocked = ref(false)
const setSkin = vi.fn((v: string | null) => {
  skin.value = v
})

mockNuxtImport('useAuth', () => () => ({ session, updateUser }))
mockNuxtImport('useSkin', () => () => ({ skin, unlocked, setSkin, hydrate: vi.fn() }))

beforeEach(() => {
  session.value = { data: { user: { id: 'u1' } } }
  skin.value = null
  unlocked.value = false
  setSkin.mockClear()
})
afterEach(() => vi.clearAllMocks())

describe('preferences skin picker', () => {
  it('hides the skin picker until the skins are unlocked', async () => {
    const wrapper = await mountSuspended(Preferences)
    expect(wrapper.find('[data-testid=skin-picker]').exists()).toBe(false)
  })

  it('shows the picker once unlocked and persists the chosen pony', async () => {
    unlocked.value = true
    const wrapper = await mountSuspended(Preferences)
    const picker = wrapper.find('[data-testid=skin-picker]')
    expect(picker.exists()).toBe(true)

    const chips = picker.findAll('button.ng-skin-chip')
    const pinkie = chips.find((c) => c.text().includes('Pinkie Pie'))
    expect(pinkie).toBeTruthy()
    await pinkie!.trigger('click')
    expect(setSkin).toHaveBeenCalledWith('pinkie')
  })
})
