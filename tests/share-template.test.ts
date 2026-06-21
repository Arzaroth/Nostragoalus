import { describe, expect, it } from 'vitest'
import type { ShareCardData } from '../server/utils/share/card'
import { shareTranslator } from '../server/utils/share/i18n'
import { buildShareCardElement, type VNode } from '../server/utils/share/template'

const t = shareTranslator('en')
const ctx = { host: 'goal.arzaroth.com', markDataUri: 'data:image/svg+xml;base64,AAAA' }

function makeCard(over: Partial<ShareCardData> = {}): ShareCardData {
  return {
    state: 'result',
    locale: 'en',
    ownerName: 'Arzaroth',
    competitionName: 'FIFA World Cup 2026',
    roundLabel: 'Group Stage',
    group: 'Group F',
    homeTeam: 'England',
    awayTeam: 'Senegal',
    homeTeamCode: 'ENG',
    awayTeamCode: 'SEN',
    predHome: 3,
    predAway: 1,
    actualHome: 3,
    actualAway: 1,
    pensHome: null,
    pensAway: null,
    tier: 'EXACT',
    totalPoints: 14,
    isJoker: true,
    crowdSharePct: 4,
    ...over,
  }
}

function collectText(node: VNode | string | number | null | undefined | false): string {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return ` ${node} `
  const children = node.props.children
  const arr = Array.isArray(children) ? children : [children]
  return arr.map((c) => collectText(c as VNode)).join('')
}

function textOf(card: ShareCardData): string {
  return collectText(buildShareCardElement(card, ctx, t))
}

describe('buildShareCardElement', () => {
  it('result: shows scoreline, my call, tier, points, joker, rarity', () => {
    const text = textOf(makeCard())
    expect(text).toContain('Nostragoalus')
    expect(text).toContain('3 - 1')
    expect(text).toContain('Exact score')
    expect(text).toContain('+14 pts')
    expect(text).toContain('Joker')
    expect(text).toContain('Only 4% of players called this scoreline')
    expect(text).toContain('Group F')
  })

  it('result: tolerates missing tier, no joker, no rarity, unknown tier color', () => {
    expect(textOf(makeCard({ tier: null, isJoker: false, crowdSharePct: null }))).toContain('+14 pts')
    // unknown tier still renders (falls back to the default chip color)
    expect(textOf(makeCard({ tier: 'WEIRD' }))).toContain('+14 pts')
  })

  it('reveal / live / sealed render their own bodies', () => {
    expect(textOf(makeCard({ state: 'reveal' }))).toContain('Kicks off soon')
    expect(textOf(makeCard({ state: 'live' }))).toContain('Kicked off')
    const sealed = textOf(makeCard({ state: 'sealed', predHome: null, predAway: null }))
    expect(sealed).toContain('Sealed pick')
    expect(sealed).not.toContain('3 - 1')
  })

  it('localizes knockout rounds and falls back to the raw label', () => {
    const round = (label: string) => textOf(makeCard({ group: null, roundLabel: label }))
    expect(round('Round of 32')).toContain(t('bracket.round.r32'))
    expect(round('Round of 16')).toContain(t('bracket.round.r16'))
    expect(round('Quarter-finals')).toContain(t('bracket.round.qf'))
    expect(round('Semi-finals')).toContain(t('bracket.round.sf'))
    expect(round('Third place play-off')).toContain(t('bracket.round.third'))
    expect(round('Final')).toContain(t('bracket.round.final'))
    expect(round('Matchday 1')).toContain('Matchday 1')
  })

  it('derives a team code from the name when none is set, and renders without a mark', () => {
    const text = collectText(
      buildShareCardElement(makeCard({ homeTeamCode: null }), { host: 'h', markDataUri: null }, t),
    )
    expect(text).toContain('ENG') // 'Eng' -> upper 'ENG' from 'England'
  })
})
