import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { authClient } from '../../lib/auth-client'

// A row from better-auth's /list-sessions: the caller's own active sessions.
// `token` is the opaque session id used to revoke a specific one.
export interface ActiveSession {
  id: string
  token: string
  ipAddress?: string | null
  userAgent?: string | null
  createdAt: string | Date
  updatedAt: string | Date
  expiresAt: string | Date
}

// better-auth client calls resolve to { data, error } rather than throwing.
// Rethrow so vue-query drives isError/isPending off the real result.
async function unwrap<T>(p: Promise<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

export function useSessions() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sessions'] })

  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => unwrap<ActiveSession[]>(authClient.listSessions()),
    // Security-sensitive list the user acts on; always show the live state.
    refetchOnMount: 'always',
  })

  // Revoke one other device by its session token. The current session's token is
  // never passed here (the UI hides its own revoke control), so this can't sign
  // the caller out from under themselves.
  const revoke = useMutation({
    mutationFn: (token: string) => unwrap(authClient.revokeSession({ token })),
    onSuccess: () => invalidate(),
  })

  // Sign out every session except the current one.
  const revokeOthers = useMutation({
    mutationFn: () => unwrap(authClient.revokeOtherSessions()),
    onSuccess: () => invalidate(),
  })

  return { sessions, revoke, revokeOthers }
}
