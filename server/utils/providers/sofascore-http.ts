import initCycleTLS, { type CycleTLSResponse } from 'cycletls'

// Shared low-level client for Sofascore's unofficial JSON API (api.sofascore.com),
// used by the odds provider and the line-up position refiner.
export const SOFASCORE_BASE_URL = 'https://api.sofascore.com'
// Honest UA matched to the JA3 below - claiming a browser UA over a non-browser
// TLS handshake is what Cloudflare 403s.
export const SOFASCORE_UA = 'curl/8.15.0'

// Sofascore's CDN fingerprints the TLS ClientHello (JA3): node/undici and even
// Alpine's own curl are blocked, while a stock desktop-curl handshake passes.
// Node can't reshape the handshake (no API for the cert-compression extension or
// the cipher set), so requests go through cycletls' uTLS engine with this
// allow-listed JA3. Update it if Sofascore ever blocks it.
const ALLOWED_JA3 =
  '771,4866-4867-4865-4868-49196-49200-52393-52392-49325-49195-49199-49324-49187-49191-49162-49172-49161-49171-157-49309-156-49308-61-60-53-47-159-52394-49311-158-49310-107-103-57-51,65281-0-11-10-16-22-23-49-13-43-45-51-27,4588-4587-4589-29-23-30-25-24-256-257-258-259-260,0-1-2'

// cycletls' response is already fetch-shaped (status, json(), text()); it just
// lacks `ok`, which the Sofascore clients check.
export function withOk(res: CycleTLSResponse): Response {
  return Object.assign(res, { ok: res.status >= 200 && res.status < 300 }) as unknown as Response
}

// One long-lived cycletls instance (it spawns a Go uTLS helper), created lazily
// so importing the module - in tests, in the build step - never starts a
// subprocess. The returned function is memoised and fetch-shaped.
let cyclePromise: ReturnType<typeof initCycleTLS> | null = null
let client: typeof fetch | null = null

export function sofascoreFetch(): typeof fetch {
  if (!client) {
    client = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      cyclePromise ??= initCycleTLS({ timeout: 30000 })
      const cy = await cyclePromise
      const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) }
      const userAgent = headers['user-agent'] ?? SOFASCORE_UA
      delete headers['user-agent']
      return withOk(await cy.get(String(input), { ja3: ALLOWED_JA3, userAgent, headers }))
    }) as unknown as typeof fetch
  }
  return client
}
