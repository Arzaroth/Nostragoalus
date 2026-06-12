import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { getMembership } from '../../../../utils/leagues/service'
import { canManageLeague } from '../../../../utils/leagues/permissions'
import { createInvite, listInvites } from '../../../../utils/leagues/invites'

const bodySchema = z.object({
  // Hours keeps the API timezone-free; null/omitted = never expires.
  expiresInHours: z.number().int().min(1).max(8760).nullish(),
  maxUses: z.number().int().min(1).max(1000).nullish(),
})

// A runaway mint loop is pointless rows; cap actives per league.
const MAX_ACTIVE_INVITES = 20

export default defineValidatedHandler({ body: bodySchema }, async ({ event, body, user }) => {
  const id = getRouterParam(event, 'id')!
  const membership = await getMembership(db, id, user.id)
  if (!canManageLeague(membership?.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  if ((await listInvites(db, id)).length >= MAX_ACTIVE_INVITES) {
    throw createError({ statusCode: 409, statusMessage: 'Too many active invites for this league' })
  }
  const invite = await createInvite(db, {
    leagueId: id,
    createdBy: user.id,
    expiresInHours: body.expiresInHours,
    maxUses: body.maxUses,
  })
  return {
    invite: {
      id: invite.id,
      token: invite.token,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      uses: invite.uses,
      createdAt: invite.createdAt,
    },
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Mint a league invite link",
    "description": "Owner/moderator only. Optional expiry (hours) and max number of uses.",
    "requestBody": {
      "required": false,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "expiresInHours": { "type": "integer", "minimum": 1, "maximum": 8760, "nullable": true },
              "maxUses": { "type": "integer", "minimum": 1, "maximum": 1000, "nullable": true }
            }
          }
        }
      }
    },
    "responses": {
      "200": { "description": "The minted invite (token included)." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Not an owner or moderator of this league." },
      "409": { "description": "Too many active invites." },
      "422": { "description": "Invalid body." }
    }
  },
})
