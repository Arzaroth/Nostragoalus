import { promises as dns } from 'node:dns'
import { isIP } from 'node:net'
import { CHROME_JA3, CHROME_UA, cycleGet, cycleHeader } from '../providers/cycle-tls'
import type { LinkPreviewDTO } from '../../../shared/types/chat'

// Server-side link unfurl for chat previews. The chat is end-to-end encrypted, so
// the client extracts a URL from a message it decrypted locally and asks us to
// fetch the page's open-graph metadata: the URL reaches the server, never the
// message text. Because we fetch an attacker-influenced URL, this is an SSRF sink
// and is guarded accordingly - every hop's host is resolved and rejected if it
// points at a private/loopback/link-local address, redirects are followed by hand
// (so a public host can't bounce us to an internal one), the response is capped,
// and only text/html is read. Results (including misses) are cached in memory.
//
// The fetch goes through the shared cycletls uTLS engine with a browser JA3, not
// Node's fetch: many sites (Cloudflare-class WAFs, e.g. 9gag) fingerprint the TLS
// handshake and 403 node/undici no matter the headers, while a browser handshake
// passes. Same reason the Sofascore client uses cycletls.

const CACHE_TTL = 60 * 60 * 1000 // 1h for a real result
// A miss (nothing useful, e.g. a transient block or a timeout) is cached only
// briefly, so a flaky fetch or a stale empty entry heals on the next view rather
// than sticking for an hour.
const MISS_TTL = 60 * 1000 // 1m
const CACHE_MAX = 500
const MAX_BYTES = 512 * 1024
const MAX_REDIRECTS = 3

const cache = new Map<string, { at: number; value: LinkPreviewDTO }>()

// Exposed for tests: drop the in-memory cache between cases.
export function __clearUnfurlCache(): void {
  cache.clear()
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b] = parts as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // link-local
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast + reserved
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const a = ip.toLowerCase()
  if (a === '::1' || a === '::') return true
  if (a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb')) return true // fe80::/10
  if (a.startsWith('fc') || a.startsWith('fd')) return true // unique-local fc00::/7
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1]!)
  return false
}

// True for any address we refuse to fetch (also true for anything unparseable, so
// the guard fails closed).
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) return isPrivateIPv4(ip)
  if (v === 6) return isPrivateIPv6(ip)
  return true
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('blocked host')
  }
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new Error('blocked address')
    return
  }
  const addrs = await dns.lookup(hostname, { all: true })
  if (!addrs.length) throw new Error('unresolved host')
  for (const a of addrs) if (isBlockedAddress(a.address)) throw new Error('blocked address')
}

async function safeFetchHtml(initial: string): Promise<{ finalUrl: string; html: string } | null> {
  let current = initial
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(current)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    await assertPublicHost(u.hostname)
    // Redirects are not followed by cycletls (disableRedirect) so we validate each
    // hop's host ourselves; the engine has its own request timeout.
    const res = await cycleGet(current, {
      ja3: CHROME_JA3,
      userAgent: CHROME_UA,
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      disableRedirect: true,
    })
    const headers = res.headers as Record<string, unknown> | undefined
    if (res.status >= 300 && res.status < 400) {
      const loc = cycleHeader(headers, 'location')
      if (!loc) return null
      current = new URL(loc, current).toString()
      continue
    }
    if (res.status < 200 || res.status >= 300) return null
    const ct = cycleHeader(headers, 'content-type') ?? ''
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null
    return { finalUrl: current, html: (await res.text()).slice(0, MAX_BYTES) }
  }
  return null // too many redirects
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
}

function matchFirst(html: string, re: RegExp): string | null {
  const m = html.match(re)
  return m?.[1] ? decodeEntities(m[1].trim()) : null
}

// A <meta> tag's content, matching either attribute order (key-then-content or
// content-then-key), for `property=` (open graph) or `name=` (twitter/classic).
function metaTag(html: string, attr: 'property' | 'name', key: string): string | null {
  const k = key.replace(/:/g, '\\:')
  return (
    matchFirst(html, new RegExp(`<meta[^>]+${attr}=["']${k}["'][^>]*content=["']([^"']*)["']`, 'i')) ??
    matchFirst(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${k}["']`, 'i'))
  )
}

function clamp(s: string | null, max: number): string | null {
  if (!s) return null
  return s.length > max ? `${s.slice(0, max)}…` : s
}

// Pull the preview fields out of a page's HTML. Pure (no network) so it is easy to
// test across the metadata shapes pages use in the wild.
export function parseLinkMeta(html: string, finalUrl: string, requestedUrl: string): LinkPreviewDTO {
  const title =
    metaTag(html, 'property', 'og:title') ??
    metaTag(html, 'name', 'twitter:title') ??
    matchFirst(html, /<title[^>]*>([^<]*)<\/title>/i)
  const description =
    metaTag(html, 'property', 'og:description') ??
    metaTag(html, 'name', 'description') ??
    metaTag(html, 'name', 'twitter:description')
  const rawImage = metaTag(html, 'property', 'og:image') ?? metaTag(html, 'name', 'twitter:image')
  let image: string | null = null
  if (rawImage) {
    try {
      const abs = new URL(rawImage, finalUrl)
      if (abs.protocol === 'http:' || abs.protocol === 'https:') image = abs.toString()
    } catch {
      image = null
    }
  }
  return {
    url: requestedUrl,
    title: clamp(title, 200),
    description: clamp(description, 300),
    image,
    siteName: clamp(metaTag(html, 'property', 'og:site_name'), 100),
  }
}

const EMPTY = (url: string): LinkPreviewDTO => ({ url, title: null, description: null, image: null, siteName: null })

function isEmptyPreview(v: LinkPreviewDTO): boolean {
  return !v.title && !v.description && !v.image && !v.siteName
}

export async function unfurlLink(rawUrl: string): Promise<LinkPreviewDTO> {
  const hit = cache.get(rawUrl)
  if (hit && Date.now() - hit.at < (isEmptyPreview(hit.value) ? MISS_TTL : CACHE_TTL)) return hit.value
  let value = EMPTY(rawUrl)
  try {
    const fetched = await safeFetchHtml(rawUrl)
    if (fetched) value = parseLinkMeta(fetched.html, fetched.finalUrl, rawUrl)
  } catch {
    // blocked host, timeout, malformed URL or network error - serve an empty
    // preview (the client just hides it) and cache the miss.
  }
  // Bound the cache: drop the oldest entry (insertion order) once full. size>=MAX
  // guarantees a first key, so the non-null assertion is safe.
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!)
  cache.set(rawUrl, { at: Date.now(), value })
  return value
}
