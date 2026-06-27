import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isBlockedAddress, parseLinkMeta, unfurlLink, __clearUnfurlCache } from './unfurl'

const { lookup, cycleGet } = vi.hoisted(() => ({ lookup: vi.fn(), cycleGet: vi.fn() }))
vi.mock('node:dns', () => ({ promises: { lookup } }))
// Mock only the uTLS GET; keep the real cycleHeader/JA3 helpers.
vi.mock('../providers/cycle-tls', async (orig) => ({ ...(await orig<object>()), cycleGet }))

// A cycletls-shaped response (status, headers object, text()) for the unfurl path.
function res(html: string, opts: { status?: number; ct?: string; location?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': opts.ct ?? 'text/html; charset=utf-8' }
  if (opts.location) headers.location = opts.location
  return { status: opts.status ?? 200, headers, text: async () => html }
}

beforeEach(() => {
  __clearUnfurlCache()
  lookup.mockReset()
  lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) // public by default
  cycleGet.mockReset()
})

describe('isBlockedAddress', () => {
  it('blocks IPv4 private, loopback, link-local, CGNAT and multicast', () => {
    for (const ip of ['10.0.0.1', '172.16.5.5', '192.168.1.1', '127.0.0.1', '169.254.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1']) {
      expect(isBlockedAddress(ip)).toBe(true)
    }
  })
  it('allows a public IPv4', () => {
    expect(isBlockedAddress('93.184.216.34')).toBe(false)
    expect(isBlockedAddress('172.32.0.1')).toBe(false) // just outside 172.16/12
  })
  it('blocks IPv6 loopback, link-local, unique-local and mapped private', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fea0::1', 'fc00::1', 'fd12::3', '::ffff:127.0.0.1']) {
      expect(isBlockedAddress(ip)).toBe(true)
    }
  })
  it('blocks IPv4-mapped/compatible private addresses in non-dotted spellings', () => {
    // The same loopback as ::ffff:127.0.0.1 written hex, fully expanded, and as a
    // bare IPv4-compatible address - all must be caught, not just the dotted form.
    for (const ip of ['::ffff:7f00:1', '0:0:0:0:0:ffff:127.0.0.1', '::127.0.0.1', '::ffff:10.0.0.1']) {
      expect(isBlockedAddress(ip)).toBe(true)
    }
  })
  it('allows a public IPv6 and a mapped public IPv4 (dotted and hex)', () => {
    expect(isBlockedAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(false)
    expect(isBlockedAddress('::ffff:93.184.216.34')).toBe(false)
    expect(isBlockedAddress('::ffff:5db8:d822')).toBe(false) // hex spelling of 93.184.216.34
  })
  it('blocks anything unparseable (fail closed)', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true)
    expect(isBlockedAddress('1.2.3')).toBe(true)
  })
})

describe('parseLinkMeta', () => {
  it('reads open-graph tags in either attribute order', () => {
    const html = `
      <meta property="og:title" content="Hello &amp; Co">
      <meta content="A description" name="description">
      <meta property="og:site_name" content="Example">`
    const out = parseLinkMeta(html, 'https://x.test/', 'https://x.test/page')
    expect(out.title).toBe('Hello & Co')
    expect(out.description).toBe('A description')
    expect(out.siteName).toBe('Example')
    expect(out.url).toBe('https://x.test/page')
  })

  it('falls back to twitter tags and the <title> element', () => {
    const html = `<title>Page Title</title><meta name="twitter:description" content="tw desc">`
    const out = parseLinkMeta(html, 'https://x.test/', 'https://x.test/')
    expect(out.title).toBe('Page Title')
    expect(out.description).toBe('tw desc')
  })

  it('resolves a relative og:image against the final URL', () => {
    const html = `<meta property="og:image" content="/img/card.png">`
    const out = parseLinkMeta(html, 'https://x.test/a/b', 'https://x.test/a/b')
    expect(out.image).toBe('https://x.test/img/card.png')
  })

  it('drops a non-http(s) image', () => {
    const html = `<meta property="og:image" content="data:image/png;base64,AAAA">`
    expect(parseLinkMeta(html, 'https://x.test/', 'https://x.test/').image).toBeNull()
  })

  it('decodes numeric and hex entities', () => {
    const html = `<meta property="og:title" content="A&#39;s &#x2764; &lt;b&gt;">`
    expect(parseLinkMeta(html, 'https://x.test/', 'https://x.test/').title).toBe("A's ❤ <b>")
  })

  it('decodes a generic decimal entity that is not the apostrophe special-case', () => {
    const html = `<meta property="og:title" content="&#65;&#66;C">`
    expect(parseLinkMeta(html, 'https://x.test/', 'https://x.test/').title).toBe('ABC')
  })

  it('drops an og:image whose URL fails to parse', () => {
    // `http://[` throws in new URL(), exercising the image catch -> null path.
    const html = `<meta property="og:image" content="http://[">`
    expect(parseLinkMeta(html, 'https://x.test/', 'https://x.test/').image).toBeNull()
  })

  it('clamps long fields', () => {
    const long = 'x'.repeat(500)
    const out = parseLinkMeta(`<meta property="og:title" content="${long}">`, 'https://x.test/', 'https://x.test/')
    expect(out.title!.length).toBe(201) // 200 + ellipsis
    expect(out.title!.endsWith('…')).toBe(true)
  })

  it('returns all-null metadata for a page with nothing useful', () => {
    const out = parseLinkMeta('<html><body>nope</body></html>', 'https://x.test/', 'https://x.test/')
    expect(out).toEqual({ url: 'https://x.test/', title: null, description: null, image: null, siteName: null })
  })
})

describe('unfurlLink', () => {
  it('fetches and parses a public page', async () => {
    cycleGet.mockResolvedValue(res('<meta property="og:title" content="Hi">'))
    const out = await unfurlLink('https://example.com/p')
    expect(out.title).toBe('Hi')
  })

  it('connects to the validated IP, carrying the hostname as SNI and Host', async () => {
    cycleGet.mockResolvedValue(res('<title>Pinned</title>'))
    await unfurlLink('https://example.com/p?q=1')
    expect(cycleGet).toHaveBeenCalledWith(
      'https://93.184.216.34/p?q=1',
      expect.objectContaining({ serverName: 'example.com', headers: expect.objectContaining({ Host: 'example.com' }) }),
    )
  })

  it('brackets an IPv6 connect host and still pins by IP', async () => {
    lookup.mockResolvedValue([{ address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }])
    cycleGet.mockResolvedValue(res('<title>v6</title>'))
    await unfurlLink('https://v6.test/p')
    expect(cycleGet).toHaveBeenCalledWith(
      'https://[2606:2800:220:1:248:1893:25c8:1946]/p',
      expect.objectContaining({ serverName: 'v6.test' }),
    )
  })

  it('does not set an SNI override for a literal IP host', async () => {
    cycleGet.mockResolvedValue(res('<title>IP</title>'))
    await unfurlLink('http://93.184.216.34/p')
    expect(cycleGet).toHaveBeenCalledWith('http://93.184.216.34/p', expect.objectContaining({ serverName: undefined }))
  })

  it('follows a redirect to a final page', async () => {
    cycleGet
      .mockResolvedValueOnce(res('', { status: 301, location: 'https://example.com/final' }))
      .mockResolvedValueOnce(res('<title>Final</title>'))
    const out = await unfurlLink('https://example.com/start')
    expect(out.title).toBe('Final')
    expect(cycleGet).toHaveBeenCalledTimes(2)
  })

  it('gives up on a redirect with no Location', async () => {
    cycleGet.mockResolvedValue(res('', { status: 302 }))
    expect((await unfurlLink('https://example.com/x')).title).toBeNull()
  })

  it('returns empty for a redirect to a non-http scheme', async () => {
    cycleGet.mockResolvedValue(res('', { status: 301, location: 'ftp://example.com/x' }))
    expect((await unfurlLink('https://example.com/x')).title).toBeNull()
  })

  it('returns empty on a non-OK status', async () => {
    cycleGet.mockResolvedValue(res('nope', { status: 404 }))
    expect((await unfurlLink('https://example.com/x')).image).toBeNull()
  })

  it('returns empty for a non-HTML content type', async () => {
    cycleGet.mockResolvedValue(res('{}', { ct: 'application/json' }))
    expect((await unfurlLink('https://example.com/x')).title).toBeNull()
  })

  it('caps an oversized body', async () => {
    cycleGet.mockResolvedValue(res('<title>' + 'a'.repeat(600 * 1024) + '</title>'))
    // Drives the byte-cap slice; parsing still succeeds here.
    expect((await unfurlLink('https://example.com/x')).url).toBe('https://example.com/x')
  })

  it('refuses a literal private IP host without fetching', async () => {
    expect((await unfurlLink('http://10.0.0.1/admin')).title).toBeNull()
    expect(cycleGet).not.toHaveBeenCalled()
  })

  it('allows a literal public IP host without a DNS lookup', async () => {
    cycleGet.mockResolvedValue(res('<title>IP</title>'))
    expect((await unfurlLink('http://93.184.216.34/p')).title).toBe('IP')
    expect(lookup).not.toHaveBeenCalled()
  })

  it('refuses a hostname that resolves to a private address', async () => {
    lookup.mockResolvedValue([{ address: '10.1.2.3', family: 4 }])
    expect((await unfurlLink('https://evil.test/x')).title).toBeNull()
    expect(cycleGet).not.toHaveBeenCalled()
  })

  it('refuses localhost-style hostnames', async () => {
    expect((await unfurlLink('http://localhost/x')).title).toBeNull()
    expect((await unfurlLink('http://db.internal/x')).title).toBeNull()
    expect(cycleGet).not.toHaveBeenCalled()
  })

  it('refuses a hostname that does not resolve', async () => {
    lookup.mockResolvedValue([])
    expect((await unfurlLink('https://void.test/x')).title).toBeNull()
  })

  it('gives up after too many redirects', async () => {
    cycleGet.mockResolvedValue(res('', { status: 301, location: 'https://example.com/loop' }))
    expect((await unfurlLink('https://example.com/loop')).title).toBeNull()
  })

  it('swallows a network/timeout error into an empty preview', async () => {
    cycleGet.mockRejectedValue(new Error('aborted'))
    expect((await unfurlLink('https://example.com/x')).title).toBeNull()
  })

  it('serves a cached result without re-fetching', async () => {
    cycleGet.mockResolvedValue(res('<title>Once</title>'))
    await unfurlLink('https://example.com/cache')
    const out = await unfurlLink('https://example.com/cache')
    expect(out.title).toBe('Once')
    expect(cycleGet).toHaveBeenCalledTimes(1)
  })

  it('caches a miss too (briefly), so it is not re-fetched immediately', async () => {
    cycleGet.mockResolvedValue(res('nope', { status: 404 }))
    expect((await unfurlLink('https://example.com/miss')).title).toBeNull()
    expect((await unfurlLink('https://example.com/miss')).title).toBeNull()
    expect(cycleGet).toHaveBeenCalledTimes(1)
  })

  it('evicts the oldest entry once the cache is full', async () => {
    cycleGet.mockResolvedValue(res('<title>x</title>'))
    for (let i = 0; i < 501; i++) await unfurlLink(`https://example.com/p${i}`)
    // No assertion beyond not throwing: this drives the eviction branch.
    expect((await unfurlLink('https://example.com/p500')).title).toBe('x')
  })
})
