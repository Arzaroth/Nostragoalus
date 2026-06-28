import { promises as dns } from 'node:dns'
import { isIP } from 'node:net'
import { CHROME_JA3, CHROME_UA, cycleGet, cycleHeader } from '../providers/cycle-tls'
import type { LinkPreviewDTO } from '#shared/types/chat'

// Server-side link unfurl for chat previews. The chat is end-to-end encrypted, so
// the client extracts a URL from a message it decrypted locally and asks us to
// fetch the page's open-graph metadata: the URL reaches the server, never the
// message text. Because we fetch an attacker-influenced URL, this is an SSRF sink
// and is guarded accordingly - every hop's host is resolved and rejected if it
// points at a private/loopback/link-local address, redirects are followed by hand
// (so a public host can't bounce us to an internal one), the buffered body is
// truncated, and only text/html is read. We fetch by hostname (not by a pinned IP):
// the uTLS engine ignores a Host override and CDN/vhost edges 403 a direct-IP
// request, so pinning would break previews for exactly the Cloudflare-class sites
// this exists for. That leaves a DNS-rebinding TOCTOU window (tracked in TODO) we
// can't close without an IP-pinning fetcher that also defeats TLS fingerprinting.
// Results
// (including misses) are cached in memory.
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

// Expand a (valid) IPv6 address - only reached for net.isIP === 6 - into its eight
// 16-bit hextets, normalising the compressed `::` form and any embedded dotted-IPv4
// tail. Normalising first means an alternate spelling of the same address (e.g.
// `::ffff:7f00:1` vs `::ffff:127.0.0.1`) can't dodge the range checks below.
function expandIPv6(ip: string): number[] {
  let a = ip.toLowerCase()
  // A trailing dotted IPv4 (mapped/compatible forms) -> two hextets.
  const v4 = a.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const o = v4.slice(1, 5).map(Number)
    a = a.slice(0, v4.index) + ((o[0]! << 8) | o[1]!).toString(16) + ':' + ((o[2]! << 8) | o[3]!).toString(16)
  }
  const [head, tail] = a.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = tail !== undefined ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left
  return groups.map((g) => parseInt(g, 16))
}

function isPrivateIPv6(ip: string): boolean {
  const g = expandIPv6(ip)
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible/loopback (::a.b.c.d, ::1, ::):
  // defer to the IPv4 ranges (which already block 0.0.0.0 and 127/8).
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return isPrivateIPv4(`${g[6]! >> 8}.${g[6]! & 0xff}.${g[7]! >> 8}.${g[7]! & 0xff}`)
  }
  if ((g[0]! & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g[0]! & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
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

// Throw if a host (or any address it resolves to) is private/blocked. Validates
// every resolved address and fails closed. Note this is a separate resolution from
// the one the uTLS engine does when it connects (it re-resolves the hostname), so a
// low-TTL rebind between the two is not closed here - see the file header and TODO.
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
    // Redirects are not followed by cycletls (disableRedirect) so we validate each
    // hop's host ourselves; the engine has its own request timeout.
    await assertPublicHost(u.hostname)
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
    // Bail before decoding/parsing an over-large body. cycletls has no streaming
    // size cap, so a lying or absent Content-Length still buffers in the engine
    // (the slice below is the hard bound on what we keep); this short-circuits the
    // common honest case where a host advertises a multi-megabyte page.
    const len = Number(cycleHeader(headers, 'content-length'))
    if (Number.isFinite(len) && len > MAX_BYTES) return null
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
