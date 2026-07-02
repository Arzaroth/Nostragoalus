import { db } from '../../../../db'
import { getWrapped } from '../../../utils/wrapped/service'
import { shareTranslator } from '../../../utils/share/i18n'
import { renderShareCardPng, type ShareFont } from '../../../utils/share/render'
import { buildWrappedCardElement } from '../../../utils/share/wrapped-template'
import { verifyWrappedToken } from '../../../utils/share/wrapped-token'

// Same bundled assets as the prediction card route; memoized per process.
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

// Public, crawler-facing wrapped card. The signed token is the only
// authorization; a forged token, an unknown user, or a not-yet-decided final
// all 404.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  const secret = useRuntimeConfig(event).betterAuthSecret
  const payload = verifyWrappedToken(secret, token)
  if (!payload) {
    setResponseStatus(event, 404)
    return 'Not found'
  }

  let wrapped
  try {
    wrapped = await getWrapped(db, { competitionId: payload.c, userId: payload.u })
  } catch {
    setResponseStatus(event, 404)
    return 'Not found'
  }
  if (!wrapped.ready) {
    setResponseStatus(event, 404)
    return 'Not found'
  }

  const [fonts, markDataUri] = await Promise.all([loadFonts(), loadMark()])
  const element = buildWrappedCardElement(
    {
      locale: payload.l,
      displayName: wrapped.displayName,
      competitionName: wrapped.competitionName,
      totalPoints: wrapped.totals.totalPoints,
      rank: wrapped.totals.rank,
      players: wrapped.totals.players,
      topPercent: wrapped.totals.topPercent,
      exact: wrapped.tiers.exact,
      trophies: wrapped.haul.trophies.length,
      badges: wrapped.haul.badges.length,
    },
    { host: getRequestURL(event).host, markDataUri },
    shareTranslator(payload.l),
  )
  const png = await renderShareCardPng(element, fonts)

  setResponseHeader(event, 'content-type', 'image/png')
  // Post-final the recap is frozen; a long cache is safe.
  setResponseHeader(event, 'cache-control', 'public, max-age=86400')
  return png
})
