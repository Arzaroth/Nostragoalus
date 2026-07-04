import { db } from '../../../../db'
import { getWrapped } from '../../../utils/wrapped/service'
import { shareTranslator } from '../../../utils/share/i18n'
import { renderShareCardPng } from '../../../utils/share/render'
import { loadShareFonts, loadShareMark, shareLoadAdditionalAsset } from '../../../utils/share/og-assets'
import { buildWrappedCardElement } from '../../../utils/share/wrapped-template'
import { verifyWrappedToken } from '../../../utils/share/wrapped-token'

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

  const [fonts, markDataUri] = await Promise.all([loadShareFonts(), loadShareMark()])
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
  const png = await renderShareCardPng(element, fonts, undefined, undefined, shareLoadAdditionalAsset)

  setResponseHeader(event, 'content-type', 'image/png')
  // Post-final the recap is frozen; a long cache is safe.
  setResponseHeader(event, 'cache-control', 'public, max-age=86400')
  return png
})
