import { createAuthClient } from 'better-auth/vue'
import { ssoClient } from '@better-auth/sso/client'

export const authClient = createAuthClient({
  plugins: [ssoClient()],
})
export const { signIn, signUp, signOut, useSession } = authClient
