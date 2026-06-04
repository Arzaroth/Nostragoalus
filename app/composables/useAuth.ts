import { authClient } from '../../lib/auth-client'

export function useAuth() {
  return {
    session: authClient.useSession(),
    signIn: authClient.signIn,
    signUp: authClient.signUp,
    signOut: authClient.signOut,
  }
}
