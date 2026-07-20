import type { ShareLocale } from './token'
import type { ShareTranslate } from './i18n'
import { shareName, type VNode } from './template'

// The summary numbers the wrapped card brags about. Kept as a plain interface
// so the builder is a pure function testable without a database.
export interface WrappedCardData {
  locale: ShareLocale
  displayName: string
  competitionName: string
  totalPoints: number
  rank: number | null
  players: number
  topPercent: number | null
  exact: number
  trophies: number
  badges: number
}

const INK = '#f5f3ff'
const MUTED = '#c4b5fd'
const ACCENT = '#a78bfa'

function el(type: string, style: Record<string, unknown>, children?: unknown): VNode {
  return { type, props: { style: { display: 'flex', ...style }, children: children as VNode['props']['children'] } }
}

function img(src: string, size: number): VNode {
  return { type: 'img', props: { style: { display: 'flex', width: size, height: size }, src } }
}

function stat(big: string, label: string): VNode {
  return el('div', { flexDirection: 'column', alignItems: 'center', gap: 6, padding: '20px 34px', borderRadius: 20, background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(196,181,253,0.3)' }, [
    el('div', { fontSize: 64, fontWeight: 700, color: INK }, big),
    el('div', { fontSize: 24, color: MUTED, textTransform: 'uppercase', letterSpacing: 2 }, label),
  ])
}

export interface WrappedCardContext {
  host: string
  markDataUri: string | null
}

export function buildWrappedCardElement(card: WrappedCardData, ctx: WrappedCardContext, t: ShareTranslate): VNode {
  const header = el('div', { alignItems: 'center', justifyContent: 'space-between', width: '100%' }, [
    el('div', { alignItems: 'center', gap: 16 }, [
      ctx.markDataUri ? img(ctx.markDataUri, 48) : null,
      el('div', { fontSize: 32, fontWeight: 700, color: INK }, 'Nostragoalus'),
    ]),
    el('div', { fontSize: 26, fontWeight: 700, color: ACCENT }, t('wrapped.card.title')),
  ])

  const stats: VNode[] = [stat(String(card.totalPoints), t('wrapped.card.pts'))]
  if (card.rank !== null) stats.push(stat(`#${card.rank}`, t('wrapped.card.rank', { players: card.players })))
  stats.push(stat(String(card.exact), t('wrapped.card.exact')))
  if (card.trophies + card.badges > 0) stats.push(stat(String(card.trophies + card.badges), t('wrapped.card.haul')))

  const center = el('div', { flexDirection: 'column', alignItems: 'center', gap: 26, flexGrow: 1, justifyContent: 'center' }, [
    el('div', { fontSize: 52, fontWeight: 700, color: INK }, shareName(card.displayName)),
    el('div', { fontSize: 28, color: MUTED }, card.competitionName),
    el('div', { gap: 22, flexWrap: 'wrap', justifyContent: 'center' }, stats),
    card.topPercent !== null
      ? el('div', { fontSize: 34, fontWeight: 700, color: ACCENT }, t('wrapped.card.top', { pct: card.topPercent }))
      : null,
  ])

  const footer = el('div', { alignItems: 'flex-end', justifyContent: 'space-between', width: '100%' }, [
    el('div', { fontSize: 26, fontWeight: 700, color: INK }, ctx.host),
    el('div', { fontSize: 20, color: MUTED }, t('wrapped.card.tagline')),
  ])

  return el(
    'div',
    {
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 60,
      backgroundColor: '#2e1065',
      backgroundImage: 'linear-gradient(135deg, #2e1065 0%, #6d28d9 100%)',
      color: INK,
      fontFamily: 'Inter, "Noto Sans Thai"',
    },
    [header, center, footer],
  )
}
