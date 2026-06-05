import { createAuthClient } from 'better-auth/vue'
import { ssoClient } from '@better-auth/sso/client'
import { adminClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [ssoClient(), adminClient()],
})
export const { signIn, signUp, signOut, useSession } = authClient
