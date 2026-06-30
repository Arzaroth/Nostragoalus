import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MatchOdds from './MatchOdds.vue'

describe('MatchOdds', () => {
  it('renders the three decimal prices with two decimals', async () => {
    const wrapper = await mountSuspended(MatchOdds, { props: { odds: { home: 2.1, draw: 3.4, away: 3.625 } } })
    const text = wrapper.text().replace(/\s+/g, ' ')
    expect(text).toContain('1 2.10')
    expect(text).toContain('X 3.40')
    expect(text).toContain('2 3.63')
    wrapper.unmount()
  })

  it('renders nothing without odds', async () => {
    const wrapper = await mountSuspended(MatchOdds, { props: { odds: null } })
    expect(wrapper.text().trim()).toBe('')
    wrapper.unmount()
  })

  it('has no expand toggle when there is no opening price or breakdown', async () => {
    const wrapper = await mountSuspended(MatchOdds, { props: { odds: { home: 2.1, draw: 3.4, away: 3.6 } } })
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows opening-vs-current drift per outcome', async () => {
    const wrapper = await mountSuspended(MatchOdds, {
      props: {
        odds: { home: 1.8, draw: 3.4, away: 4.2, initial: { home: 2.2, draw: 3.4, away: 3.5 }, bookmakers: null },
      },
    })
    const shortened = wrapper.find('[aria-label^="Shortened"]')
    const drifted = wrapper.find('[aria-label^="Drifted"]')
    expect(shortened.attributes('aria-label')).toBe('Shortened by 0.40')
    expect(drifted.attributes('aria-label')).toBe('Drifted by 0.70')
    // The unchanged draw gets no arrow.
    expect(wrapper.findAll('[aria-label="Unchanged"]')).toHaveLength(0)
    wrapper.unmount()
  })

  it('expands to list opening prices and the per-bookmaker breakdown', async () => {
    const wrapper = await mountSuspended(MatchOdds, {
      props: {
        odds: {
          home: 1.8,
          draw: 3.6,
          away: 4.2,
          initial: { home: 2.2, draw: 3.3, away: 3.5 },
          bookmakers: [
            { key: 'bet365', title: 'bet365', home: 1.8, draw: 3.6, away: 4.2 },
            { key: 'pinnacle', title: 'Pinnacle', home: 1.83, draw: 3.55, away: 4.1 },
          ],
        },
      },
    })
    const toggle = wrapper.find('button')
    expect(toggle.exists()).toBe(true)
    // Collapsed by default: bookmaker rows are hidden.
    expect(wrapper.text()).not.toContain('Pinnacle')

    await toggle.trigger('click')
    const text = wrapper.text().replace(/\s+/g, ' ')
    expect(text).toContain('Opening')
    expect(text).toContain('2.20')
    expect(text).toContain('bet365')
    expect(text).toContain('Pinnacle')
    expect(text).toContain('1.83')
    wrapper.unmount()
  })

  it('expands the per-bookmaker breakdown even when there is no opening price', async () => {
    const wrapper = await mountSuspended(MatchOdds, {
      props: {
        odds: {
          home: 1.8,
          draw: 3.6,
          away: 4.2,
          initial: null,
          bookmakers: [{ key: 'bet365', title: 'bet365', home: 1.81, draw: 3.62, away: 4.15 }],
        },
      },
    })
    const toggle = wrapper.find('button')
    expect(toggle.exists()).toBe(true)
    await toggle.trigger('click')
    const text = wrapper.text().replace(/\s+/g, ' ')
    expect(text).toContain('bet365')
    expect(text).toContain('1.81')
    // No opening price was supplied, so no Opening row.
    expect(text).not.toContain('Opening')
    wrapper.unmount()
  })

  it('renders a dash instead of crashing on a non-numeric bookmaker price', async () => {
    const wrapper = await mountSuspended(MatchOdds, {
      props: {
        odds: {
          home: 1.8,
          draw: 3.6,
          away: 4.2,
          initial: null,
          // A malformed/changed provider feed delivers a price as a string.
          bookmakers: [{ key: 'x', title: 'BadFeed', home: 'oops' as unknown as number, draw: 3.6, away: 4.2 }],
        },
      },
    })
    await wrapper.find('button').trigger('click')
    const text = wrapper.text().replace(/\s+/g, ' ')
    expect(text).toContain('BadFeed')
    expect(text).toContain('–')
    expect(text).toContain('3.60')
    wrapper.unmount()
  })
})
