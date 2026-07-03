import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { resolveLeagueManage } from '../../../utils/leagues/service'
import { listLeagueRewards, type LeagueRewardWrite, setLeagueRewards } from '../../../utils/rewards/service'
import { storeRewardFromDataUrl } from '../../../utils/rewards/image'
import { useStorageDriver } from '../../../utils/storage'

const itemSchema = z.object({
  type: z.enum(['OVERALL', 'GROUP_PHASE', 'KNOCKOUT_PHASE', 'MADAME_IRMA', 'TEAM_SPECIALIST']),
  label: z.string().max(120),
  // A data: URL uploads a new image, null clears it, absent keeps the current one.
  imageDataUrl: z.string().max(1_400_000).nullish(),
  note: z.string().max(500).nullish(),
  link: z.string().max(500).nullish(),
})

const bodySchema = z.object({ items: z.array(itemSchema).max(5) })

export default defineValidatedHandler({ body: bodySchema }, async ({ event, body, user }) => {
  const id = getRouterParam(event, 'id')!
  // Owner or moderator (throws 403/404 via toHttpError otherwise).
  await resolveLeagueManage(db, id, user.id)

  const writes: LeagueRewardWrite[] = []
  for (const it of body.items) {
    let imageKey: string | null | undefined
    if (it.imageDataUrl === null) imageKey = null
    else if (typeof it.imageDataUrl === 'string' && it.imageDataUrl.startsWith('data:')) {
      imageKey = await storeRewardFromDataUrl(useStorageDriver(), it.imageDataUrl)
    }
    writes.push({ type: it.type, label: it.label, imageKey, note: it.note ?? null, link: it.link ?? null })
  }

  await setLeagueRewards(db, id, writes)
  return { ok: true, rewards: await listLeagueRewards(db, id) }
})

defineRouteMeta({
  openAPI: {
    tags: ['Leagues'],
    summary: 'Configure league prizes',
    description:
      "Owner/moderator only. Set the prize (label + optional image + note + link) for each criterion; a blank label removes it. Send imageDataUrl as a data: URL to upload, null to clear, omit to keep.",
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                maxItems: 5,
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['OVERALL', 'GROUP_PHASE', 'KNOCKOUT_PHASE', 'MADAME_IRMA', 'TEAM_SPECIALIST'] },
                    label: { type: 'string' },
                    imageDataUrl: { type: 'string', nullable: true },
                    note: { type: 'string', nullable: true },
                    link: { type: 'string', nullable: true },
                  },
                  required: ['type', 'label'],
                },
              },
            },
            required: ['items'],
          },
        },
      },
    },
    responses: {
      '200': { description: 'The saved prizes.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Not an owner or moderator.' },
      '404': { description: 'Unknown league.' },
      '422': { description: 'Invalid body.' },
    },
  },
})
