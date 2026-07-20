import { appleAppSiteAssociation } from '../../utils/auth/well-known'

// iOS Universal Links. Apple fetches this over https with no redirects and
// expects application/json at exactly this extension-less path. Unconfigured =
// 404 (no Apple Team ID exists for this project yet).
export default defineEventHandler((event) => {
  const body = appleAppSiteAssociation(process.env.NUXT_IOS_APP_IDS)
  if (!body) throw createError({ statusCode: 404, statusMessage: 'No iOS app ID is configured' })
  setResponseHeader(event, 'content-type', 'application/json')
  return body
})
