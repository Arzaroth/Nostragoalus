import { createAuthClient } from 'better-auth/vue'
import { ssoClient } from '@better-auth/sso/client'
import { passkeyClient } from '@better-auth/passkey/client'
import { adminClient, twoFactorClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [
    ssoClient(),
    adminClient(),
    passkeyClient(),
    twoFactorClient({
      // A sign-in that requires the second factor lands on the verification page.
      onTwoFactorRedirect() {
        window.location.href = '/two-factor'
      },
    }),
  ],
})
export const { signIn, signUp, signOut, useSession } = authClient
