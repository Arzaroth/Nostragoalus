import initCycleTLS, { type CycleTLSResponse } from 'cycletls'

// Shared uTLS client. Some upstreams (Cloudflare-class WAFs) fingerprint the TLS
// ClientHello (JA3) and 403 node/undici outright - the bundled runtime can't
// reshape its own handshake. cycletls spawns a Go uTLS helper that can, so a
// request goes out with a chosen JA3. Used by the Sofascore JSON client and by
// chat link unfurls, sharing ONE engine (one subprocess), created lazily so
// importing the module - in tests, in the build - never starts it.
let enginePromise: ReturnType<typeof initCycleTLS> | null = null
function engine(): ReturnType<typeof initCycleTLS> {
  enginePromise ??= initCycleTLS({ timeout: 30_000 })
  return enginePromise
}

export interface CycleGetOptions {
  ja3: string
  userAgent: string
  headers?: Record<string, string>
  // TLS SNI to send. Lets a caller dial a URL whose host is a literal IP while
  // still presenting the real hostname (cert match), for IP-pinned SSRF-safe fetch.
  serverName?: string
  // Return a 3xx instead of following it - so a caller fetching arbitrary URLs
  // can validate each redirect hop itself (SSRF guard).
  disableRedirect?: boolean
}

// One GET through the uTLS engine with a chosen JA3.
export async function cycleGet(url: string, opts: CycleGetOptions): Promise<CycleTLSResponse> {
  const cy = await engine()
  return cy.get(url, {
    ja3: opts.ja3,
    userAgent: opts.userAgent,
    headers: opts.headers ?? {},
    serverName: opts.serverName,
    disableRedirect: opts.disableRedirect,
  })
}

// cycletls' response is already fetch-ish (status, json(), text()); it just lacks
// `ok`, which the Sofascore clients check.
export function withOk(res: CycleTLSResponse): Response {
  return Object.assign(res, { ok: res.status >= 200 && res.status < 300 }) as unknown as Response
}

// cycletls returns each header value as a string OR string[]; read one (case-
// insensitively) as a flat string.
export function cycleHeader(headers: Record<string, unknown> | undefined, name: string): string | null {
  if (!headers) return null
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return Array.isArray(v) ? String(v[0] ?? '') : String(v)
  }
  return null
}

// A current desktop-Chrome JA3 + matching UA. Most sites trust a real browser
// handshake where they 403 a curl/bot one (e.g. 9gag blocks the curl JA3). Update
// the JA3 if it ever goes stale and starts getting blocked.
export const CHROME_JA3 =
  '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27,29-23-24,0'
export const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
