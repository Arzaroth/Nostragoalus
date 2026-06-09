import type { AppDatabase } from '../../../db/types'
import { ssoProvider } from '../../../db/schema'

// @better-auth/sso natively supports several captured domains per provider as a
// comma-separated list in sso_provider.domain (exact or subdomain match). These
// helpers keep our admin/login endpoints on the same semantics as the plugin.

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

export function normalizeDomain(raw: string): string | null {
  const d = raw.trim().toLowerCase().replace(/^@/, '')
  return DOMAIN_RE.test(d) ? d : null
}

// Accepts "corp.com, corp.fr" or ["corp.com", "@corp.fr"]; rejects on any invalid entry.
export function parseDomainList(input: unknown): string[] | null {
  const parts = Array.isArray(input) ? input.map(String) : String(input ?? '').split(/[\s,]+/)
  const out: string[] = []
  for (const part of parts) {
    if (!part.trim()) continue
    const d = normalizeDomain(part)
    if (!d) return null
    if (!out.includes(d)) out.push(d)
  }
  return out.length > 0 ? out : null
}

export function domainOfEmail(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 1 || at === email.length - 1) return null
  return normalizeDomain(email.slice(at + 1))
}

// Mirrors the plugin's domainMatches: CSV list, exact or subdomain suffix match.
export function domainMatchesList(domain: string, csv: string | null): boolean {
  if (!csv) return false
  return csv
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .some((d) => domain === d || domain.endsWith(`.${d}`))
}

export async function resolveSsoProviderId(db: AppDatabase, domain: string): Promise<string | null> {
  const rows = await db
    .select({ providerId: ssoProvider.providerId, domain: ssoProvider.domain })
    .from(ssoProvider)
  return rows.find((r) => domainMatchesList(domain, r.domain))?.providerId ?? null
}

// Domains already captured by another provider - first-come-first-served.
// Checked both ways: claiming mail.corp.com under someone's corp.com is a
// conflict, and so is claiming corp.com when someone holds mail.corp.com
// (subdomain matching would make sign-ins ambiguous in either direction).
export async function findDomainConflicts(
  db: AppDatabase,
  providerId: string,
  domains: string[],
): Promise<string[]> {
  const rows = await db
    .select({ providerId: ssoProvider.providerId, domain: ssoProvider.domain })
    .from(ssoProvider)
  const others = rows.filter((r) => r.providerId !== providerId)
  return domains.filter((d) =>
    others.some(
      (o) =>
        domainMatchesList(d, o.domain) ||
        (o.domain ?? '')
          .split(',')
          .map((od) => od.trim().toLowerCase())
          .filter(Boolean)
          .some((od) => domainMatchesList(od, d)),
    ),
  )
}
