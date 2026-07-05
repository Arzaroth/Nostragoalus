import type { ShareTranslate } from './i18n'
import type { ProfileCardData } from './profile-card'
import type { ShareLocale } from './token'
import type { VNode } from './template'

// The profile card element tree (satori consumes it). Pure builder, unit-tested
// without a database; the OG route feeds the tree to satori. Emerald palette to
// set it apart from the indigo prediction card and the violet wrapped card.
export interface ProfileCardInput extends ProfileCardData {
  locale: ShareLocale
}

const INK = '#ecfdf5'
const MUTED = '#a7f3d0'
const ACCENT = '#34d399'

function el(type: string, style: Record<string, unknown>, children?: unknown): VNode {
  return { type, props: { style: { display: 'flex', ...style }, children: children as VNode['props']['children'] } }
}

function img(src: string, size: number): VNode {
  return { type: 'img', props: { style: { display: 'flex', width: size, height: size }, src } }
}

function stat(big: string, label: string): VNode {
  return el('div', { flexDirection: 'column', alignItems: 'center', gap: 6, padding: '20px 34px', borderRadius: 20, background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(167,243,208,0.3)' }, [
    el('div', { fontSize: 64, fontWeight: 700, color: INK }, big),
    el('div', { fontSize: 24, color: MUTED, textTransform: 'uppercase', letterSpacing: 2 }, label),
  ])
}

export interface ProfileCardContext {
  host: string
  markDataUri: string | null
}

export function buildProfileCardElement(card: ProfileCardInput, ctx: ProfileCardContext, t: ShareTranslate): VNode {
  const header = el('div', { alignItems: 'center', justifyContent: 'space-between', width: '100%' }, [
    el('div', { alignItems: 'center', gap: 16 }, [
      ctx.markDataUri ? img(ctx.markDataUri, 48) : null,
      el('div', { fontSize: 32, fontWeight: 700, color: INK }, 'Nostragoalus'),
    ]),
    el('div', { fontSize: 26, fontWeight: 700, color: ACCENT }, t('share.profileCard.title')),
  ])

  const stats: VNode[] = [stat(String(card.totalPoints), t('share.profileCard.pts'))]
  if (card.rank !== null) stats.push(stat(`#${card.rank}`, t('share.profileCard.rank', { players: card.players })))
  stats.push(stat(String(card.exact), t('share.profileCard.exact')))
  if (card.trophies + card.badges > 0) stats.push(stat(String(card.trophies + card.badges), t('share.profileCard.haul')))

  const center = el('div', { flexDirection: 'column', alignItems: 'center', gap: 26, flexGrow: 1, justifyContent: 'center' }, [
    el('div', { fontSize: 52, fontWeight: 700, color: INK }, card.displayName),
    el('div', { fontSize: 28, color: MUTED }, card.competitionName),
    el('div', { gap: 22, flexWrap: 'wrap', justifyContent: 'center' }, stats),
  ])

  const footer = el('div', { alignItems: 'flex-end', justifyContent: 'space-between', width: '100%' }, [
    el('div', { fontSize: 26, fontWeight: 700, color: INK }, ctx.host),
    el('div', { fontSize: 20, color: MUTED }, t('share.profileCard.tagline')),
  ])

  return el(
    'div',
    {
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 60,
      backgroundColor: '#064e3b',
      backgroundImage: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)',
      color: INK,
      fontFamily: 'Inter, "Noto Sans Thai"',
    },
    [header, center, footer],
  )
}
