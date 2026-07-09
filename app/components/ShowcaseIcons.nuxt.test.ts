import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { ShowcaseIconDto } from '#shared/types/achievements'
import ShowcaseIcons from './ShowcaseIcons.vue'

let wrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('ShowcaseIcons', () => {
  it('renders one icon per showcased achievement', async () => {
    const items: ShowcaseIconDto[] = [
      { key: 'sharpshooter', category: 'MILESTONE', tier: 'SILVER' },
      { key: 'contrarian', category: 'CROWD', tier: 'GOLD' },
    ]
    wrapper = await mountSuspended(ShowcaseIcons, { props: { items } })
    expect(wrapper.findAll('i')).toHaveLength(2)
  })

  it('renders nothing for an empty showcase', async () => {
    wrapper = await mountSuspended(ShowcaseIcons, { props: { items: [] } })
    expect(wrapper.findAll('i')).toHaveLength(0)
  })

  it('renders the SHAME thumbs-down icon, matching the cabinet (not the generic fallback)', async () => {
    const items: ShowcaseIconDto[] = [{ key: 'cold-streak', category: 'SHAME', tier: 'BRONZE' }]
    wrapper = await mountSuspended(ShowcaseIcons, { props: { items } })
    const icon = wrapper.find('i')
    expect(icon.classes()).toContain('pi-thumbs-down')
    expect(icon.classes()).not.toContain('pi-verified')
  })
})
