import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { isSsoManaged } from '../../utils/auth/sso-managed'

// Whether the caller's identity is owned by a (still-registered) SSO provider,
// plus whether the instance can send mail (drives the deletion-confirmation
// flow). Server-rendered by the account page so sections never flash in.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return {
    ssoManaged: await isSsoManaged(db, user.id),
    mailEnabled: Boolean(process.env.NUXT_SMTP_URL),
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'SSO management status',
    description: 'True when the account signs in through a registered SSO provider and has no local password.',
    responses: {
      '200': { description: 'Status.' },
      '401': { description: 'Not signed in.' },
    },
  },
})
