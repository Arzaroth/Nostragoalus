import { db } from '../../../../db'
import { shareTranslator } from '../../../utils/share/i18n'
import { renderShareCardPng } from '../../../utils/share/render'
import { loadShareFonts, loadShareMark, shareLoadAdditionalAsset } from '../../../utils/share/og-assets'
import { getProfileCard } from '../../../utils/share/profile-card'
import { buildProfileCardElement } from '../../../utils/share/profile-template'
import { verifyProfileToken } from '../../../utils/share/profile-token'

// Public, crawler-facing profile card. The signed token is the only
// authorization; a forged token or an unknown user/competition 404s.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  const secret = useRuntimeConfig(event).betterAuthSecret
  const payload = verifyProfileToken(secret, token)
  if (!payload) {
    setResponseStatus(event, 404)
    return 'Not found'
  }

  let card
  try {
    card = await getProfileCard(db, { competitionId: payload.c, userId: payload.u })
  } catch {
    setResponseStatus(event, 404)
    return 'Not found'
  }

  const [fonts, markDataUri] = await Promise.all([loadShareFonts(), loadShareMark()])
  const element = buildProfileCardElement(
    { ...card, locale: payload.l },
    { host: getRequestURL(event).host, markDataUri },
    shareTranslator(payload.l),
  )
  const png = await renderShareCardPng(element, fonts, undefined, undefined, shareLoadAdditionalAsset)

  setResponseHeader(event, 'content-type', 'image/png')
  // The standing shifts as matches are scored, so keep the cache short.
  setResponseHeader(event, 'cache-control', 'public, max-age=300')
  return png
})
