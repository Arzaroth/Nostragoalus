import { assetLinks } from '../../utils/auth/well-known'

// Android Digital Asset Links. Serving this is what turns the manifest's
// android:autoVerify="true" into a VERIFIED App Link (the app opens
// goal.arzaroth.com links directly, and no other app can claim them).
// Unconfigured = 404, which is what the domain served before: better no file at
// all than one publishing a fingerprint anyone can sign with.
export default defineEventHandler((event) => {
  const body = assetLinks(process.env.NUXT_ANDROID_CERT_FINGERPRINTS)
  if (!body) throw createError({ statusCode: 404, statusMessage: 'No Android app fingerprint is configured' })
  setResponseHeader(event, 'content-type', 'application/json')
  return body
})
