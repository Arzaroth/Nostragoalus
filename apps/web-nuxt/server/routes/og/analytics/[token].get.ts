import { db } from '../../../../db'
import { shareTranslator } from '../../../utils/share/i18n'
import { renderShareCardPng } from '../../../utils/share/render'
import { loadShareFonts, loadShareMark, shareLoadAdditionalAsset } from '../../../utils/share/og-assets'
import { getAnalyticsCard } from '../../../utils/share/analytics-card'
import { buildAnalyticsCardElement } from '../../../utils/share/analytics-template'
import { verifyAnalyticsToken } from '../../../utils/share/analytics-token'

// Public, crawler-facing personal-analytics card. The signed token is the only
// authorization; a forged token, an unknown user/competition, or a user with no
// scored pick yet all 404.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  const secret = useRuntimeConfig(event).betterAuthSecret
  const payload = verifyAnalyticsToken(secret, token)
  if (!payload) {
    setResponseStatus(event, 404)
    return 'Not found'
  }

  let card
  try {
    card = await getAnalyticsCard(db, { competitionId: payload.c, userId: payload.u })
  } catch {
    setResponseStatus(event, 404)
    return 'Not found'
  }
  if (!card.hasData) {
    setResponseStatus(event, 404)
    return 'Not found'
  }

  const [fonts, markDataUri] = await Promise.all([loadShareFonts(), loadShareMark()])
  const element = buildAnalyticsCardElement(
    { ...card, locale: payload.l },
    { host: getRequestURL(event).host, markDataUri },
    shareTranslator(payload.l),
  )
  const png = await renderShareCardPng(element, fonts, undefined, undefined, shareLoadAdditionalAsset)

  setResponseHeader(event, 'content-type', 'image/png')
  // The report shifts as matches are scored, so keep the cache short.
  setResponseHeader(event, 'cache-control', 'public, max-age=300')
  return png
})
