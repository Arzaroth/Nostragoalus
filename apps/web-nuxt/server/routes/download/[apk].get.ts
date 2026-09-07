import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { androidDownloadDir, apkPath, readAndroidBuild } from '../../utils/app-download'
import { apkResponse, etagSatisfied } from '../../utils/app-download/serve'

// Serves the published Android APK, at the versioned URL and at the stable alias
// older installs have pinned. The requested name never reaches the filesystem -
// the file is always `apkPath(dir)`, and the name only chooses which of the three
// answers in `apkResponse` applies.
export default defineEventHandler(async (event) => {
  const dir = androidDownloadDir()
  const build = await readAndroidBuild(dir)
  const answer = apkResponse(
    build,
    getRouterParam(event, 'apk') ?? '',
    new URL(event.path, 'http://n').search.slice(1),
  )
  if (answer.kind === 'notFound') {
    throw createError({ statusCode: 404, statusMessage: 'No Android build published' })
  }
  if (answer.kind === 'redirect') {
    // 302, not 301: the stable alias points at whichever build is current, and a
    // browser that cached a permanent redirect would keep asking for a version
    // that is no longer published.
    return sendRedirect(event, answer.to, 302)
  }
  // `serve` is only returned for an available build, but the headers are built
  // from these three and reading them off a null would produce a lying response
  // rather than an error.
  if (build.sizeBytes === null || build.sha256 === null) {
    throw createError({ statusCode: 404, statusMessage: 'No Android build published' })
  }

  const cacheControl = answer.immutable
    ? 'public, max-age=31536000, immutable'
    : 'no-cache'
  // Before the body: a revalidating client that already holds these bytes gets
  // 304 and nothing else. The alias revalidates on every request, and each one
  // used to resend the whole file.
  if (etagSatisfied(getRequestHeader(event, 'if-none-match'), build.sha256)) {
    setResponseHeaders(event, { etag: `"${build.sha256}"`, 'cache-control': cacheControl })
    setResponseStatus(event, 304)
    return null
  }

  setResponseHeaders(event, {
    'content-type': 'application/vnd.android.package-archive',
    'content-length': build.sizeBytes,
    'content-disposition': `attachment; filename="${answer.filename}"`,
    // The digest identifies the build, so a client can revalidate.
    etag: `"${build.sha256}"`,
    // A versioned URL's bytes never change, so it can be held forever - which is
    // the point: without this every download streams the full file out of this
    // process. The stable alias only reaches here for an unversioned build, where
    // a replaced APK must not be served from a cache under the old bytes.
    'cache-control': cacheControl,
  })
  // pipeline, not sendStream: h3's sendStream cancels with `stream.abort()`, which
  // fs.ReadStream does not implement, so a cancelled download (a dropped mobile
  // link on a ~90 MB file) would leak the file descriptor and never settle.
  // pipeline destroys the read stream on abort and always resolves or rejects.
  try {
    await pipeline(createReadStream(apkPath(dir)), event.node.res)
  } catch {
    // The client went away mid-download. The stream is already destroyed and the
    // response is gone, so there is nothing to report and nothing to clean up.
  }
})
