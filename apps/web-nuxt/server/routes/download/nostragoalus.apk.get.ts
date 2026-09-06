import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { androidDownloadDir, apkPath, downloadFilename, readAndroidBuild } from '../../utils/app-download'

// Serves the published Android APK. The path is fixed (no user input reaches the
// filesystem), and the file lives outside the build output, so a new build is
// published by dropping it in the directory - no redeploy.
export default defineEventHandler(async (event) => {
  const dir = androidDownloadDir()
  const build = await readAndroidBuild(dir)
  // The three go together (readAndroidBuild only fills them for a real file), but
  // checking each keeps the headers honest instead of asserting non-null.
  if (!build.available || build.sizeBytes === null || build.sha256 === null) {
    throw createError({ statusCode: 404, statusMessage: 'No Android build published' })
  }
  setResponseHeaders(event, {
    'content-type': 'application/vnd.android.package-archive',
    'content-length': build.sizeBytes,
    'content-disposition': `attachment; filename="${downloadFilename(build.version)}"`,
    // The digest identifies the build, so a client can revalidate; a replaced APK
    // must not be served from a proxy's cache under the old bytes.
    etag: `"${build.sha256}"`,
    'cache-control': 'no-cache',
  })
  // pipeline, not sendStream: h3's sendStream cancels with `stream.abort()`, which
  // fs.ReadStream does not implement, so a cancelled download (a dropped mobile
  // link on a ~60 MB file) would leak the file descriptor and never settle.
  // pipeline destroys the read stream on abort and always resolves or rejects.
  try {
    await pipeline(createReadStream(apkPath(dir)), event.node.res)
  } catch {
    // The client went away mid-download. The stream is already destroyed and the
    // response is gone, so there is nothing to report and nothing to clean up.
  }
})
