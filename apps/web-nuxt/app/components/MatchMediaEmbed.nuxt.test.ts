import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MatchMediaEmbed from './MatchMediaEmbed.vue'

const base = { id: 'x', label: null, sandbox: null as boolean | null, allow: null as string | null }

describe('MatchMediaEmbed', () => {
  it('embeds a recognised provider as its nocookie player with the player sandbox + origin referrer', async () => {
    const w = await mountSuspended(MatchMediaEmbed, { props: { item: { ...base, kind: 'REPLAY', url: 'https://youtu.be/rep1', embeddable: true } } })
    const f = w.find('iframe')
    expect(f.exists()).toBe(true)
    expect(f.attributes('src')).toBe('https://www.youtube-nocookie.com/embed/rep1')
    expect(f.attributes('sandbox')).toContain('allow-same-origin')
    expect(f.attributes('referrerpolicy')).toBe('strict-origin-when-cross-origin')
    w.unmount()
  })

  it('drops the sandbox attribute (and uses the custom allow) when sandbox is off', async () => {
    const w = await mountSuspended(MatchMediaEmbed, {
      props: { item: { ...base, kind: 'LIVE', url: 'https://ppv.example/embed/x', embeddable: true, sandbox: false, allow: 'encrypted-media' } },
    })
    const f = w.find('iframe')
    expect(f.exists()).toBe(true)
    expect(f.attributes('sandbox')).toBeUndefined()
    expect(f.attributes('allow')).toBe('encrypted-media')
    expect(f.attributes('referrerpolicy')).toBe('no-referrer')
    // fullscreen rides the static attribute even when allow omits the token.
    expect(f.attributes('allowfullscreen')).toBeDefined()
    w.unmount()
  })

  it('renders an external link (no iframe) for a non-embeddable item', async () => {
    const w = await mountSuspended(MatchMediaEmbed, {
      props: { item: { ...base, kind: 'LIVE', url: 'https://grey.example/live', label: 'Mirror', embeddable: false } },
    })
    expect(w.find('iframe').exists()).toBe(false)
    const a = w.find('a[href="https://grey.example/live"]')
    expect(a.exists()).toBe(true)
    expect(a.attributes('target')).toBe('_blank')
    expect(a.attributes('rel')).toContain('noopener')
    expect(a.text()).toContain('Mirror')
    w.unmount()
  })
})
