import { ANDROID_DOWNLOAD_PATH } from '../utils/app-download'
import { routedPath } from '../utils/auth/routed-path'
import {
  CLIENT_HEADER,
  clientRefusal,
  isVersionGatedPath,
  resolveMinAndroidClient,
} from '../utils/clients/service'

// Refuse an Android build the server has outgrown, once, with a status the app
// can act on - rather than letting it fail later in whatever shape the
// incompatibility happens to take. The decision itself is `clientRefusal`.
//
// `routedPath`, not `event.path`: the latter is the percent-DECODED target and
// disagrees with what the router dispatches, which is the whole reason
// `utils/auth/routed-path.ts` exists.
export default defineEventHandler((event) => {
  const path = routedPath(event)
  if (!isVersionGatedPath(path)) return
  // These responses now depend on a request header, so say so - on the gated
  // paths only, to leave page-document caching alone. Nothing caches them today
  // (the throw happens before Nitro's route-rule cache, and the error carries no
  // Cache-Control), but the first `swr`/`cache` rule added to an /api path would
  // otherwise let one client class's answer be served to another.
  appendResponseHeader(event, 'Vary', CLIENT_HEADER)
  const refusal = clientRefusal(
    path,
    getRequestHeader(event, CLIENT_HEADER),
    resolveMinAndroidClient(useRuntimeConfig(event).minAndroidClient),
  )
  if (!refusal) return
  throw createError({
    statusCode: 426,
    statusMessage: 'Upgrade Required',
    data: { ...refusal, downloadUrl: ANDROID_DOWNLOAD_PATH },
  })
})
