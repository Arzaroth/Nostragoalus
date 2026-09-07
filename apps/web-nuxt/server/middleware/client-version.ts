import { ANDROID_DOWNLOAD_PATH } from '../utils/app-download'
import {
  CLIENT_HEADER,
  MIN_ANDROID_CLIENT,
  isClientTooOld,
  isVersionGatedPath,
  parseClientHeader,
} from '../utils/clients/service'

// Refuse an Android build the server has outgrown, once, with a status the app
// can act on - rather than letting it fail later in whatever shape the
// incompatibility happens to take.
//
// Which paths this applies to, and why, is in `isVersionGatedPath`.
export default defineEventHandler((event) => {
  if (!isVersionGatedPath(event.path)) return
  const client = parseClientHeader(getRequestHeader(event, CLIENT_HEADER))
  if (!isClientTooOld(client)) return
  throw createError({
    statusCode: 426,
    statusMessage: 'Upgrade Required',
    data: {
      error: 'client_too_old',
      minimum: MIN_ANDROID_CLIENT,
      current: client!.version,
      downloadUrl: ANDROID_DOWNLOAD_PATH,
    },
  })
})
