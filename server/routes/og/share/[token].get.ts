import { flagUrl } from '../../../../shared/share-card'
import { db } from '../../../../db'
import { getPredictionForShare } from '../../../utils/predictions/service'
import { buildShareCardData } from '../../../utils/share/card'
import { shareTranslator } from '../../../utils/share/i18n'
import { renderShareCardPng, type ShareFont } from '../../../utils/share/render'
import { buildShareCardElement } from '../../../utils/share/template'
import { verifyShareToken } from '../../../utils/share/token'

// Fonts + brand mark are bundled server assets (assets:server). Read once and
// memoized for the process - satori needs the raw font bytes on every render.
const FONT_FILES: Array<{ file: string; name: string; weight: 400 | 700 }> = [
  { file: 'fonts/Inter-400.woff', name: 'Inter', weight: 400 },
  { file: 'fonts/Inter-700.woff', name: 'Inter', weight: 700 },
  { file: 'fonts/NotoSansThai-400.woff', name: 'Noto Sans Thai', weight: 400 },
  { file: 'fonts/NotoSansThai-700.woff', name: 'Noto Sans Thai', weight: 700 },
]

let fontsPromise: Promise<ShareFont[]> | null = null
function loadFonts(): Promise<ShareFont[]> {
  if (!fontsPromise) {
    const storage = useStorage('assets:server')
    fontsPromise = Promise.all(
      FONT_FILES.map(async (f) => {
        const raw = (await storage.getItemRaw(f.file)) as Uint8Array
        return { name: f.name, data: Buffer.from(raw), weight: f.weight, style: 'normal' as const }
      }),
    )
  }
  return fontsPromise
}

let markPromise: Promise<string | null> | null = null
function loadMark(): Promise<string | null> {
  if (!markPromise) {
    markPromise = (async () => {
      try {
        const raw = (await useStorage('assets:server').getItemRaw('share-mark.svg')) as Uint8Array | null
        return raw ? `data:image/svg+xml;base64,${Buffer.from(raw).toString('base64')}` : null
      } catch {
        return null
      }
    })()
  }
  return markPromise
}

// satori can't fetch remote images, so the FIFA flag (static per team code) is
// fetched here, inlined as a data URI, and cached for the process. A failed
// fetch resolves to null and the card falls back to the code pill alone, so a
// flaky CDN never breaks the render.
const flagCache = new Map<string, Promise<string | null>>()
function loadFlag(code: string | null): Promise<string | null> {
  const url = flagUrl(code)
  if (!url || !code) return Promise.resolve(null)
  let cached = flagCache.get(code)
  if (!cached) {
    cached = (async () => {
      try {
        const res = await fetch(url)
        if (!res.ok) return null
        const type = res.headers.get('content-type') || 'image/png'
        const buf = Buffer.from(await res.arrayBuffer())
        return `data:${type};base64,${buf.toString('base64')}`
      } catch {
        return null
      }
    })()
    flagCache.set(code, cached)
  }
  return cached
}

// Public, crawler-facing OG image. The signed token is the only authorization -
// no session - so a forged token (or one whose prediction is gone) simply 404s.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  const secret = useRuntimeConfig(event).betterAuthSecret
  const payload = verifyShareToken(secret, token)
  if (!payload) {
    setResponseStatus(event, 404)
    return 'Not found'
  }

  const row = await getPredictionForShare(db, payload.p)
  if (!row) {
    setResponseStatus(event, 404)
    return 'Not found'
  }

  const card = buildShareCardData(row, { mode: payload.m, locale: payload.l })
  const [fonts, markDataUri, homeFlag, awayFlag] = await Promise.all([
    loadFonts(),
    loadMark(),
    loadFlag(card.homeTeamCode),
    loadFlag(card.awayTeamCode),
  ])
  const element = buildShareCardElement(
    card,
    { host: getRequestURL(event).host, markDataUri, homeFlag, awayFlag },
    shareTranslator(payload.l),
  )
  const png = await renderShareCardPng(element, fonts)

  setResponseHeader(event, 'content-type', 'image/png')
  // A finished result is immutable; a pre-kickoff/live card can change soon (a
  // sealed token flips to a result at kickoff), so cache that only briefly.
  setResponseHeader(event, 'cache-control', `public, max-age=${card.state === 'result' ? 86400 : 120}`)
  return png
})
