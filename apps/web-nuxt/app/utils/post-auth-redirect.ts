// Where to land after sign-in/up. Honors ?next= for deep links (e.g. an
// invite landing page bouncing through login), but only same-origin absolute
// PATHS - never a full URL or protocol-relative // - so it can't be an open
// redirect to another site.
export function safeNext(next: unknown, fallback = '/matches'): string {
  if (typeof next !== 'string' || !next) return fallback
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}
