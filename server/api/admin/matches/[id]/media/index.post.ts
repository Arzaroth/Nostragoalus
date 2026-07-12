import { z } from 'zod'
import { db } from '../../../../../../db'
import { defineValidatedHandler } from '../../../../../utils/validated-handler'
import { addMatchMedia } from '../../../../../utils/match-media/service'
import { MATCH_MEDIA_KINDS, isValidStreamUrl } from '../../../../../../shared/match-media'

const bodySchema = z.object({
  kind: z.enum(MATCH_MEDIA_KINDS),
  url: z.string().max(2048).refine(isValidStreamUrl, 'must be a valid https URL'),
  label: z.string().trim().min(1).max(80).optional(),
  // null/omitted = inherit the host-whitelist default; true/false = admin override.
  embeddable: z.boolean().nullish(),
  // Per-link iframe overrides. sandbox: null = per-trust default, true = force the
  // player sandbox, false = no sandbox attribute (a host that refuses sandboxing).
  // allow: a custom feature-policy (sanitised to bare tokens in the service).
  sandbox: z.boolean().nullish(),
  allow: z.string().max(512).nullish(),
})

const responseSchema = z.object({ id: z.string() })

// admin session OR a media:write API key (the curation bot); requireApiKey still
// requires the key's owner to be an admin since this is an admin route.
export default defineValidatedHandler({ admin: true, apiKey: { media: ['write'] }, body: bodySchema, response: responseSchema }, async ({ event, body }) => {
  const matchId = getRouterParam(event, 'id') as string
  const row = await addMatchMedia(db, {
    matchId,
    kind: body.kind,
    url: body.url,
    label: body.label,
    embeddable: body.embeddable,
    sandbox: body.sandbox,
    allow: body.allow,
  })
  return { id: row.id }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Add a match watch link',
    description: 'Internal: attach a LIVE/REPLAY/HIGHLIGHTS link to a match. Accepts an admin session or a media:write API key (the curation bot).',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['LIVE', 'REPLAY', 'HIGHLIGHTS'] },
              url: { type: 'string', description: 'https URL of the stream/replay/highlights.' },
              label: { type: 'string', description: '1-80 chars, e.g. "FR commentary".' },
              embeddable: { type: 'boolean', nullable: true, description: 'Override the host-whitelist embed default.' },
              sandbox: { type: 'boolean', nullable: true, description: 'null = per-trust default, true = force the player sandbox, false = no sandbox attribute (hosts that refuse sandboxing).' },
              allow: { type: 'string', nullable: true, description: 'Custom iframe feature-policy (allow attribute); sanitised to bare tokens.' },
            },
            required: ['kind', 'url'],
          },
        },
      },
    },
    responses: {
      '200': { description: 'The created link id.' },
      '400': { description: 'Invalid url.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
      '404': { description: 'Unknown match.' },
      '422': { description: 'Invalid body.' },
    },
  },
})
