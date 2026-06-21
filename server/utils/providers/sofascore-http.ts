import { Agent, fetch as undiciFetch } from 'undici'

// Shared low-level client for Sofascore's unofficial JSON API (api.sofascore.com),
// used by the odds provider and the line-up position refiner. Keyless but
// Cloudflare-fronted: it wants a browser User-Agent and a spoofed TLS handshake.
export const SOFASCORE_BASE_URL = 'https://api.sofascore.com'
export const SOFASCORE_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0'

// Sofascore's CDN fingerprints the TLS ClientHello: Node's trimmed default
// cipher list is answered with 403 regardless of headers or HTTP version, while
// OpenSSL's stock list ('DEFAULT') passes. Lazy singleton so importing the
// module (tests, builds) never constructs a dispatcher.
let tlsSpoofedFetch: typeof fetch | null = null
export function sofascoreFetch(): typeof fetch {
  if (!tlsSpoofedFetch) {
    const dispatcher = new Agent({ connect: { ciphers: 'DEFAULT' } })
    tlsSpoofedFetch = ((input: Parameters<typeof undiciFetch>[0], init?: Parameters<typeof undiciFetch>[1]) =>
      undiciFetch(input, { ...init, dispatcher })) as unknown as typeof fetch
  }
  return tlsSpoofedFetch
}
