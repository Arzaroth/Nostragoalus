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
    setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
    return await readFile(file, 'utf8')
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'No build integrity fingerprint' })
  }
})
