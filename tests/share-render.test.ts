import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildShareCardData, type ShareCardInput } from '../server/utils/share/card'
import { shareTranslator } from '../server/utils/share/i18n'
import { renderShareCardPng, type ShareFont } from '../server/utils/share/render'
import { buildShareCardElement } from '../server/utils/share/template'

const FONT_DIR = new URL('../server/assets/fonts/', import.meta.url)
function font(file: string, weight: 400 | 700): ShareFont {
  return { name: file.startsWith('Inter') ? 'Inter' : 'Noto Sans Thai', data: readFileSync(new URL(file, FONT_DIR)), weight, style: 'normal' }
}
const FONTS: ShareFont[] = [
  font('Inter-400.woff', 400),
  font('Inter-700.woff', 700),
  font('NotoSansThai-400.woff', 400),
  font('NotoSansThai-700.woff', 700),
]

const MARK = `data:image/svg+xml;base64,${readFileSync(new URL('../public/brand/mark.svg', import.meta.url)).toString('base64')}`

const base: ShareCardInput = {
  homeGoals: 3,
  awayGoals: 1,
  isJoker: true,
  baseTier: 'EXACT',
  totalPoints: 14,
  crowdShare: 0.04,
  kickoffTime: new Date('2026-06-20T18:00:00Z'),
  status: 'FINISHED',
  fullTimeHome: 3,
  fullTimeAway: 1,
  penaltiesHome: null,
  penaltiesAway: null,
  homeTeam: 'England',
  awayTeam: 'Senegal',
  homeTeamCode: 'ENG',
  awayTeamCode: 'SEN',
  roundLabel: 'Group Stage',
  group: 'Group F',
  competitionName: 'FIFA World Cup 2026',
  ownerName: 'Arzaroth',
}

// PNG magic number: 89 50 4E 47.
function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
}

const PRE = new Date('2026-06-20T12:00:00Z')
const POST = new Date('2026-06-20T20:00:00Z')

describe('share card render', () => {
  const cases: Array<{ name: string; el: ReturnType<typeof buildShareCardElement> }> = []

  it('renders all states to PNG', async () => {
    const states = [
      { name: 'result', card: buildShareCardData(base, { mode: 'result', locale: 'en' }, POST) },
      { name: 'live', card: buildShareCardData({ ...base, status: 'LIVE', totalPoints: null }, { mode: 'result', locale: 'en' }, POST) },
      { name: 'reveal', card: buildShareCardData(base, { mode: 'reveal', locale: 'en' }, PRE) },
      { name: 'sealed', card: buildShareCardData(base, { mode: 'sealed', locale: 'en' }, PRE) },
      { name: 'thai', card: buildShareCardData(base, { mode: 'result', locale: 'th' }, POST) },
    ]
    for (const s of states) {
      const el = buildShareCardElement(s.card, { host: 'goal.arzaroth.com', markDataUri: MARK }, shareTranslator(s.card.locale))
      const png = await renderShareCardPng(el, FONTS)
      expect(isPng(png)).toBe(true)
      cases.push({ name: s.name, el })
    }
    if (process.env.SHARE_CARD_DUMP) {
      const out = '/tmp/share-cards'
      mkdirSync(out, { recursive: true })
      for (const s of states) {
        const el = buildShareCardElement(s.card, { host: 'goal.arzaroth.com', markDataUri: MARK }, shareTranslator(s.card.locale))
        writeFileSync(`${out}/${s.name}.png`, await renderShareCardPng(el, FONTS))
      }
    }
  })
})
