import { randomBytes } from 'node:crypto'

// Short-lived "sudo mode" proofs: issued after a fresh password (+2FA) check,
// required by sensitive endpoints (e.g. passkey registration). In-memory is
// fine - the app is a single long-running instance.
const tokens = new Map<string, { userId: string; exp: number }>()

export function issueReauth(userId: string, ttlMs = 5 * 60_000, now = Date.now()): string {
  const token = randomBytes(24).toString('base64url')
  tokens.set(token, { userId, exp: now + ttlMs })
  return token
}

export function checkReauth(token: string | undefined | null, userId: string, now = Date.now()): boolean {
  if (!token) return false
  const entry = tokens.get(token)
  if (!entry) return false
  if (entry.exp < now) {
    tokens.delete(token)
    return false
  }
  return entry.userId === userId
}
