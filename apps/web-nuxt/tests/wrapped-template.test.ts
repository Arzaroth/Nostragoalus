import { describe, expect, it } from 'vitest'
import { shareTranslator } from '../server/utils/share/i18n'
import { buildWrappedCardElement, type WrappedCardData } from '../server/utils/share/wrapped-template'
import type { VNode } from '../server/utils/share/template'

function card(over: Partial<WrappedCardData> = {}): WrappedCardData {
  return {
    locale: 'en',
    displayName: 'alice',
    competitionName: 'Test Cup',
    totalPoints: 42,
    rank: 3,
    players: 128,
    topPercent: 3,
    exact: 7,
    trophies: 1,
    badges: 5,
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

function textOf(data: WrappedCardData): string {
  const el = buildWrappedCardElement(data, { host: 'goal.example.com', markDataUri: null }, shareTranslator(data.locale))
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

describe('buildWrappedCardElement', () => {
  it('renders name, competition, points, rank, exacts, haul and the top percent', () => {
    const text = textOf(card())
    expect(text).toContain('alice')
    expect(text).toContain('Test Cup')
    expect(text).toContain('42')
    expect(text).toContain('#3')
    expect(text).toContain('7')
    expect(text).toContain('6')
    expect(text).toContain('Top 3%')
    expect(text).toContain('goal.example.com')
  })

  it('drops the rank stat and top percent for an unranked user', () => {
    const text = textOf(card({ rank: null, topPercent: null }))
    expect(text).not.toContain('#')
    expect(text).not.toContain('Top')
  })

  it('drops the haul stat when nothing was earned', () => {
    const text = textOf(card({ trophies: 0, badges: 0 }))
    expect(text).not.toContain('trophies & badges')
  })

  it('localizes the card copy', () => {
    const text = textOf(card({ locale: 'fr' }))
    expect(text).toContain('Retro du tournoi')
  })

  it('embeds the brand mark image when a mark data URI is supplied', () => {
    const mark = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    const el = buildWrappedCardElement(card(), { host: 'goal.example.com', markDataUri: mark }, shareTranslator('en'))
    expect(hasImg(el, mark)).toBe(true)
  })
})
