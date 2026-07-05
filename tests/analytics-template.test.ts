import { describe, expect, it } from 'vitest'
import { shareTranslator } from '../server/utils/share/i18n'
import { buildAnalyticsCardElement, type AnalyticsCardInput } from '../server/utils/share/analytics-template'
import type { VNode } from '../server/utils/share/template'

function card(over: Partial<AnalyticsCardInput> = {}): AnalyticsCardInput {
  return {
    locale: 'en',
    displayName: 'alice',
    competitionName: 'Test Cup',
    hasData: true,
    accuracyPct: 66,
    exactPct: 20,
    goalLean: 0.4,
    homeBiasPct: -12,
    ...over,
  }
}

function collectText(node: VNode | string | number | null | undefined | false, out: string[]): void {
  if (node == null || node === false) return
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return
  }
  const children = node.props.children
  if (Array.isArray(children)) for (const c of children) collectText(c, out)
  else collectText(children, out)
}

function textOf(data: AnalyticsCardInput): string {
  const el = buildAnalyticsCardElement(data, { host: 'goal.example.com', markDataUri: null }, shareTranslator(data.locale))
  const out: string[] = []
  collectText(el, out)
  return out.join(' | ')
}

function hasImg(node: VNode | string | number | null | undefined | false, src: string): boolean {
  if (node == null || node === false || typeof node === 'string' || typeof node === 'number') return false
  if (node.type === 'img' && (node.props as { src?: string }).src === src) return true
  const children = node.props.children
  if (Array.isArray(children)) return children.some((c) => hasImg(c, src))
  return hasImg(children, src)
}

describe('buildAnalyticsCardElement', () => {
  it('renders name, competition and the signed bias stats', () => {
    const text = textOf(card())
    expect(text).toContain('alice')
    expect(text).toContain('Test Cup')
    expect(text).toContain('66%')
    expect(text).toContain('20%')
    // Signed lean/bias so the direction is visible.
    expect(text).toContain('+0.4')
    expect(text).toContain('-12%')
    expect(text).toContain('goal.example.com')
  })

  it('renders a non-positive lean without a plus sign', () => {
    const text = textOf(card({ goalLean: 0, homeBiasPct: 0 }))
    expect(text).toContain('0.0')
    expect(text).not.toContain('+0.0')
  })

  it('localizes the card copy', () => {
    expect(textOf(card({ locale: 'fr' }))).toContain('Stats')
  })

  it('embeds the brand mark image when a mark data URI is supplied', () => {
    const mark = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    const el = buildAnalyticsCardElement(card(), { host: 'goal.example.com', markDataUri: mark }, shareTranslator('en'))
    expect(hasImg(el, mark)).toBe(true)
  })
})
