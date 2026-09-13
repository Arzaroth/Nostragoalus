import { z } from 'zod'
import { db } from '../../../../db'
import { defineReadHandler } from '../../../utils/read-handler'
import { getDefaultCompetitionSlug, listCompetitions } from '../../../utils/competitions/store'
import { DISCOVERABLE_PROVIDERS } from '../../../utils/competitions/discovery'
import { MATCH_PROVIDERS } from '../../../utils/providers/factory'

const responseSchema = z.object({
  competitions: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      provider: z.string(),
      externalCompetitionId: z.string(),
      seasonHint: z.string().nullable(),
      isActive: z.boolean(),
    }),
  ),
  defaultSlug: z.string(),
  // Every provider a competition can be bound to, and the subset that can list
  // its own catalog. The rest are not second-class: probe and create take any of
  // them, so the screen offers a typed-in id instead of a picker.
  providers: z.array(z.string()),
  discoverableProviders: z.array(z.string()),
})

export default defineReadHandler({ response: responseSchema, auth: 'admin' }, async () => {
  // listCompetitions, not listActiveCompetitions: the admin screen is the one
  // place an archived competition still has to be visible, to restore it.
  const [competitions, defaultSlug] = await Promise.all([listCompetitions(db), getDefaultCompetitionSlug(db)])
  return {
    competitions: competitions.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      provider: c.provider,
      externalCompetitionId: c.externalCompetitionId,
      seasonHint: c.seasonHint,
      isActive: c.isActive,
    })),
    defaultSlug,
    providers: [...MATCH_PROVIDERS],
    discoverableProviders: [...DISCOVERABLE_PROVIDERS],
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Every competition, archived ones included",
    "description": "The admin competition list: provider binding, season and active state for every competition, plus the resolved default, every provider a competition can be bound to, and the subset that can enumerate its own catalog. Unlike /api/competitions this includes archived rows, since the admin screen is where they are restored.",
    "responses": {
      "200": { "description": "{ competitions, defaultSlug, providers, discoverableProviders }." },
      "403": { "description": "Not an admin." }
    }
  },
})
