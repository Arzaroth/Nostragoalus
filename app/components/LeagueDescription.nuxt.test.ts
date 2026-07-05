import { afterEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import LeagueDescription from './LeagueDescription.vue'

mockNuxtImport('useLeagueActions', () => () => ({
  update: { mutateAsync: async () => ({ ok: true }), isPending: ref(false) },
}))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('LeagueDescription', () => {
  it('renders sanitized markdown and strips dangerous HTML', async () => {
    const w = await mountSuspended(LeagueDescription, {
      props: { leagueId: 'lg1', description: '# Rules\n\nBe **nice** <script>alert(1)</script>', canManage: false },
    })
    const html = w.html()
    expect(html).toContain('<h1>Rules</h1>')
    expect(html).toContain('<strong>nice</strong>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
    w.unmount()
  })

  it('shows an add-description prompt to a manager when empty', async () => {
    const w = await mountSuspended(LeagueDescription, {
      props: { leagueId: 'lg1', description: null, canManage: true },
    })
    const text = w.text()
    expect(text).toContain('No description yet')
    expect(text).toContain('Add a description')
    w.unmount()
  })

  it('renders nothing for a non-manager with no description', async () => {
    const w = await mountSuspended(LeagueDescription, {
      props: { leagueId: 'lg1', description: null, canManage: false },
    })
    expect(w.text()).toBe('')
    w.unmount()
  })
})
