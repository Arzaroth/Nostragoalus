import { z } from 'zod'
import { androidDownloadUrl, currentAndroidBuild } from '../../utils/app-download'
import { defineReadHandler } from '../../utils/read-handler'

export const responseSchema = z.object({
  available: z.boolean(),
  version: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  sha256: z.string().nullable(),
  builtAt: z.string().nullable(),
  downloadUrl: z.string(),
})

export default defineReadHandler({ response: responseSchema }, async () => {
  const build = await currentAndroidBuild()
  // The versioned URL, so the site and a current app skip the alias redirect and
  // land on the cacheable response. An unversioned build has no versioned URL and
  // gets the stable path back.
  return { ...build, downloadUrl: androidDownloadUrl(build.version) }
})

defineRouteMeta({
  openAPI: {
    tags: ['App'],
    summary: 'Android build',
    description:
      'Whether an Android APK is published for download, with its version, size and SHA-256 so it can be verified before installing. `available: false` when the deploy has published no build.',
    responses: {
      '200': { description: 'The published Android build, or an unavailable marker.' },
    },
  },
})
