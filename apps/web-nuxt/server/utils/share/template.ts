import { roundLabelKey, shareScore, TIER_COLOR } from '../../../shared/share-card'
import type { ShareCardData } from './card'
import type { ShareTranslate } from './i18n'

// A minimal element tree satori consumes ({ type, props: { style, children } }).
// Declaring it locally keeps this builder dependency-free and unit-testable -
// the route is what actually feeds the tree to satori.
export interface VNode {
  type: string
  props: { style: Record<string, unknown>; children?: VChildren; src?: string }
}
type VChild = VNode | string | number | null | undefined | false
type VChildren = VChild | VChild[]

export const SHARE_CARD_WIDTH = 1200
export const SHARE_CARD_HEIGHT = 630

// Display names are unbounded user text and the card gives them one line. Cap by
// code point (slicing UTF-16 units would split a surrogate pair into a lone
// tofu); this also bounds how many font subsets one render can pull.
export function shareName(name: string, max = 40): string {
  const chars = [...name]
  return chars.length <= max ? name : `${chars.slice(0, max).join('')}...`
}

const INK = '#f5f3ff'
const MUTED = '#a5b4fc'
const ACCENT = '#818cf8'

function el(type: string, style: Record<string, unknown>, children?: VChildren): VNode {
  return { type, props: { style: { display: 'flex', ...style }, children } }
}

function img(src: string, size: number): VNode {
  return { type: 'img', props: { style: { display: 'flex', width: size, height: size }, src } }
}

function teamCode(code: string | null, team: string): string {
  return code ?? team.slice(0, 3).toUpperCase()
}

// Group letter ("Group F") when present, else a localized knockout round name.
function roundContext(card: ShareCardData, t: ShareTranslate): string {
  if (card.group) return card.group
  const key = roundLabelKey(card.roundLabel)
  return key ? t(key) : card.roundLabel
}

function pill(text: string): VNode {
  return el(
    'div',
    {
      fontSize: 58,
      fontWeight: 700,
      letterSpacing: 2,
      padding: '8px 26px',
      borderRadius: 18,
      background: 'rgba(255,255,255,0.07)',
      border: '2px solid rgba(165,180,252,0.35)',
      color: INK,
    },
    text,
  )
}

// Flags are inlined as data URIs by the route (satori can't fetch remote
// images); null when unavailable, in which case the block is just the code pill.
export interface TeamFlags {
  home: string | null
  away: string | null
}

function flagImg(src: string): VNode {
  return { type: 'img', props: { style: { display: 'flex', width: 56, height: 56, borderRadius: 10 }, src } }
}

function teamBlock(code: string, name: string, flag: string | null): VNode {
  return el('div', { flexDirection: 'column', alignItems: 'center', gap: 12, width: 320 }, [
    flag ? flagImg(flag) : null,
    pill(code),
    el('div', { fontSize: 26, color: MUTED, maxWidth: 300, overflow: 'hidden' }, name),
  ])
}

function chip(text: string, bg: string, color = INK): VNode {
  return el(
    'div',
    { fontSize: 30, fontWeight: 700, padding: '6px 20px', borderRadius: 12, background: bg, color },
    text,
  )
}

function centerScore(big: string, label: string, sub?: string | null): VNode {
  return el('div', { flexDirection: 'column', alignItems: 'center', gap: 6, flexGrow: 1 }, [
    el('div', { fontSize: 24, color: MUTED, textTransform: 'uppercase', letterSpacing: 3 }, label),
    el('div', { fontSize: 88, fontWeight: 700, color: INK }, big),
    sub ? el('div', { fontSize: 26, color: MUTED }, sub) : null,
  ])
}

function matchupRow(card: ShareCardData, center: VNode, flags: TeamFlags): VNode {
  return el('div', { alignItems: 'center', justifyContent: 'space-between', width: '100%' }, [
    teamBlock(teamCode(card.homeTeamCode, card.homeTeam), card.homeTeam, flags.home),
    center,
    teamBlock(teamCode(card.awayTeamCode, card.awayTeam), card.awayTeam, flags.away),
  ])
}

function resultBody(card: ShareCardData, t: ShareTranslate, flags: TeamFlags): VNode[] {
  const myCall = `${t('share.card.myCall')} ${shareScore(card.predHome, card.predAway)}`
  // state === 'result' guarantees totalPoints is set; tier can still be absent.
  const meta: VNode[] = [chip(myCall, 'rgba(255,255,255,0.07)')]
  if (card.tier) meta.push(chip(t(`predictions.tier.${card.tier.toLowerCase()}`), TIER_COLOR[card.tier] ?? '#64748b'))
  meta.push(chip(`+${card.totalPoints ?? 0} ${t('share.card.pts')}`, ACCENT, '#1e1b4b'))
  if (card.isJoker) meta.push(chip(t('share.card.joker'), '#7c3aed'))

  // A penalty-decided knockout shows the shootout under the 90-min score (the
  // unfurled image must not present a 1-1 pens win as a plain draw).
  const pens = card.pensHome != null && card.pensAway != null ? `(${card.pensHome}-${card.pensAway} ${t('match.pens')})` : null
  const rows: VNode[] = [
    matchupRow(card, centerScore(shareScore(card.actualHome, card.actualAway), t('share.card.fullTime'), pens), flags),
    el('div', { gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }, meta),
  ]
  if (card.crowdSharePct != null) {
    rows.push(el('div', { fontSize: 28, color: MUTED, marginTop: 4 }, t('share.card.rarity', { pct: card.crowdSharePct })))
  }
  return rows
}

function revealBody(card: ShareCardData, t: ShareTranslate, flags: TeamFlags): VNode[] {
  return [
    matchupRow(card, centerScore(shareScore(card.predHome, card.predAway), t('share.card.myCall')), flags),
    el('div', { justifyContent: 'center', marginTop: 4 }, [
      chip(t('share.card.kickoffSoon'), 'rgba(255,255,255,0.07)', MUTED),
    ]),
  ]
}

function liveBody(card: ShareCardData, t: ShareTranslate, flags: TeamFlags): VNode[] {
  return [
    matchupRow(card, centerScore(shareScore(card.predHome, card.predAway), t('share.card.myCall')), flags),
    el('div', { justifyContent: 'center', marginTop: 4 }, [chip(t('share.card.kickedOff'), '#ef4444')]),
  ]
}

function sealedBody(card: ShareCardData, t: ShareTranslate, flags: TeamFlags): VNode[] {
  return [
    matchupRow(
      card,
      el('div', { flexDirection: 'column', alignItems: 'center', gap: 8, flexGrow: 1 }, [
        el('div', { fontSize: 56, fontWeight: 700, color: INK }, t('share.card.sealed')),
        el('div', { fontSize: 26, color: MUTED }, t('share.card.sealedSub')),
      ]),
      flags,
    ),
  ]
}

function body(card: ShareCardData, t: ShareTranslate, flags: TeamFlags): VNode[] {
  switch (card.state) {
    case 'result':
      return resultBody(card, t, flags)
    case 'reveal':
      return revealBody(card, t, flags)
    case 'live':
      return liveBody(card, t, flags)
    case 'sealed':
      return sealedBody(card, t, flags)
  }
}

export interface ShareCardContext {
  host: string
  // Inlined brand mark as a data URI; null falls back to the wordmark only.
  markDataUri: string | null
  // Inlined team flags as data URIs; null falls back to the code pill alone.
  homeFlag: string | null
  awayFlag: string | null
}

export function buildShareCardElement(card: ShareCardData, ctx: ShareCardContext, t: ShareTranslate): VNode {
  const header = el('div', { alignItems: 'center', justifyContent: 'space-between', width: '100%' }, [
    el('div', { alignItems: 'center', gap: 16 }, [
      ctx.markDataUri ? img(ctx.markDataUri, 48) : null,
      el('div', { fontSize: 32, fontWeight: 700, color: INK }, 'Nostragoalus'),
    ]),
    el('div', { flexDirection: 'column', alignItems: 'flex-end' }, [
      el('div', { fontSize: 24, color: MUTED }, card.competitionName),
      el('div', { fontSize: 22, fontWeight: 600, color: ACCENT }, roundContext(card, t)),
    ]),
  ])

  const footer = el('div', { alignItems: 'flex-end', justifyContent: 'space-between', width: '100%' }, [
    el('div', { flexDirection: 'column', gap: 4 }, [
      el('div', { fontSize: 26, fontWeight: 700, color: INK }, ctx.host),
      el('div', { fontSize: 20, color: MUTED }, t('share.card.tagline')),
    ]),
    el('div', { fontSize: 22, color: MUTED }, card.ownerName),
  ])

  return el(
    'div',
    {
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 60,
      backgroundColor: '#1e1b4b',
      backgroundImage: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
      color: INK,
      fontFamily: 'Inter, "Noto Sans Thai"',
    },
    [header, el('div', { flexDirection: 'column', justifyContent: 'center', flexGrow: 1, gap: 28 }, body(card, t, { home: ctx.homeFlag, away: ctx.awayFlag })), footer],
  )
}
