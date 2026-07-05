import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { resolveLeagueManage } from '../../../utils/leagues/service'
import { storeRewardFromDataUrl } from '../../../utils/rewards/image'
import { useStorageDriver } from '../../../utils/storage'

// Upload an image for the league description (markdown) and return its serving URL.
// Reuses the reward image store (content-addressed, size/type validated). Owner or
// moderator only, so a non-manager can't fill storage.
const bodySchema = z.object({ imageDataUrl: z.string().max(1_400_000) })

export default defineValidatedHandler({ body: bodySchema }, async ({ event, body, user }) => {
  const id = getRouterParam(event, 'id')!
  await resolveLeagueManage(db, id, user.id)
  const key = await storeRewardFromDataUrl(useStorageDriver(), body.imageDataUrl)
  return { url: `/api/media/${key}` }
})

defineRouteMeta({
  openAPI: {
    tags: ['Leagues'],
    summary: 'Upload a league description image',
    description: 'Owner/moderator only. Send imageDataUrl as a base64 data: URL (jpeg/png/webp/gif, max 512KB); returns the stored image URL to embed in the markdown description.',
    responses: {
      '200': { description: 'The stored image URL.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Not an owner or moderator.' },
      '404': { description: 'Unknown league.' },
      '422': { description: 'Invalid or oversized image.' },
    },
  },
})
