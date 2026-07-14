import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

// scripts/build-integrity (the package.json `postbuild` hook) writes
// .output/public/build-integrity.json AFTER `nuxt build` has already frozen the
// node-server preset's public-asset manifest, so Nitro never registers it and
// serving it as a static file 404s (on prod and anywhere `node .output/server`
// runs). Read it off disk through this registered route instead. Absent (dev, or
// a build where the fingerprint was skipped) -> 404, so /about shows its "no
// fingerprint" fallback.
export default defineEventHandler(async (event) => {
  const file = resolve(dirname(process.argv[1]), '../public/build-integrity.json')
  try {
    // Immutable per build, but an operator wants the live server's own digest to
    // detect a swap, so don't let a CDN pin a stale copy.
    setResponseHeader(event, 'cache-control', 'no-cache')
    setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
    return await readFile(file, 'utf8')
  } catch (err) {
    // Absent (dev, or a build that skipped the fingerprint) -> 404 so /about shows
    // its fallback. Any other read error is a real fault - surface it, don't mask.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError({ statusCode: 404, statusMessage: 'No build integrity fingerprint' })
    }
    throw err
  }
})
