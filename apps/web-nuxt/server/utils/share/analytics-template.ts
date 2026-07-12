import type { AnalyticsCardData } from './analytics-card'
import type { ShareTranslate } from './i18n'
import type { ShareLocale } from './token'
import type { VNode } from './template'

// The personal-analytics card element tree (satori consumes it). Pure builder,
// unit-tested without a database; the OG route feeds the tree to satori. Amber
// palette to set it apart from the indigo prediction, violet wrapped and emerald
// profile cards.
export interface AnalyticsCardInput extends AnalyticsCardData {
  locale: ShareLocale
}

const INK = '#fffbeb'
const MUTED = '#fde68a'
const ACCENT = '#fbbf24'

function el(type: string, style: Record<string, unknown>, children?: unknown): VNode {
  return { type, props: { style: { display: 'flex', ...style }, children: children as VNode['props']['children'] } }
}

function img(src: string, size: number): VNode {
  return { type: 'img', props: { style: { display: 'flex', width: size, height: size }, src } }
}

function stat(big: string, label: string): VNode {
  return el('div', { flexDirection: 'column', alignItems: 'center', gap: 6, padding: '20px 30px', borderRadius: 20, background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(253,230,138,0.3)' }, [
    el('div', { fontSize: 58, fontWeight: 700, color: INK }, big),
    el('div', { fontSize: 22, color: MUTED, textTransform: 'uppercase', letterSpacing: 2 }, label),
  ])
}

// A signed number reads as a lean/bias ("+0.4", "-12"); a plain magnitude would
// hide the direction the whole card is about. A value that rounds to zero
// collapses to unsigned "0" - never a stray "-0"/"-0.0".
function signed(n: number, digits = 0): string {
  const r = Number(n.toFixed(digits))
  const v = (r === 0 ? 0 : r).toFixed(digits)
  return r > 0 ? `+${v}` : v
}

export interface AnalyticsCardContext {
  host: string
  markDataUri: string | null
}

export function buildAnalyticsCardElement(card: AnalyticsCardInput, ctx: AnalyticsCardContext, t: ShareTranslate): VNode {
  const header = el('div', { alignItems: 'center', justifyContent: 'space-between', width: '100%' }, [
    el('div', { alignItems: 'center', gap: 16 }, [
      ctx.markDataUri ? img(ctx.markDataUri, 48) : null,
      el('div', { fontSize: 32, fontWeight: 700, color: INK }, 'Nostragoalus'),
    ]),
    el('div', { fontSize: 26, fontWeight: 700, color: ACCENT }, t('share.analyticsCard.title')),
  ])

  const stats: VNode[] = [
    stat(`${card.accuracyPct}%`, t('share.analyticsCard.accuracy')),
    stat(`${card.exactPct}%`, t('share.analyticsCard.exact')),
    stat(signed(card.goalLean, 1), t('share.analyticsCard.goals')),
    stat(`${signed(card.homeBiasPct)}%`, t('share.analyticsCard.home')),
  ]

  const center = el('div', { flexDirection: 'column', alignItems: 'center', gap: 26, flexGrow: 1, justifyContent: 'center' }, [
    el('div', { fontSize: 52, fontWeight: 700, color: INK }, card.displayName),
    el('div', { fontSize: 28, color: MUTED }, card.competitionName),
    el('div', { gap: 20, flexWrap: 'wrap', justifyContent: 'center' }, stats),
  ])

  const footer = el('div', { alignItems: 'flex-end', justifyContent: 'space-between', width: '100%' }, [
    el('div', { fontSize: 26, fontWeight: 700, color: INK }, ctx.host),
    el('div', { fontSize: 20, color: MUTED }, t('share.analyticsCard.tagline')),
  ])

  return el(
    'div',
    {
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 60,
      backgroundColor: '#78350f',
      backgroundImage: 'linear-gradient(135deg, #78350f 0%, #b45309 100%)',
      color: INK,
      fontFamily: 'Inter, "Noto Sans Thai"',
    },
    [header, center, footer],
  )
}
