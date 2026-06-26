import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isBlockedAddress, parseLinkMeta, unfurlLink, __clearUnfurlCache } from './unfurl'

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock('node:dns', () => ({ promises: { lookup } }))

// Build a minimal fetch Response stand-in for the fields the unfurl reads.
function res(
  html: string,
  opts: { status?: number; ct?: string; location?: string; body?: 'reader' | 'none' } = {},
) {
  const status = opts.status ?? 200
  const headers = new Map<string, string>([['content-type', opts.ct ?? 'text/html; charset=utf-8']])
  if (opts.location) headers.set('location', opts.location)
  const base = {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
  }
  if ((opts.body ?? 'reader') === 'none') {
    return { ...base, body: null, text: async () => html }
  }
  const enc = new TextEncoder().encode(html)
  return {
    ...base,
    body: {
      getReader: () => {
        let sent = false
        return {
          read: async () => (sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: enc })),
          cancel: async () => {},
        }
      },
    },
  }
}

beforeEach(() => {
  __clearUnfurlCache()
  lookup.mockReset()
  lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) // public by default
})
afterEach(() => {
  vi.unstubAllGlobals()
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
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12::3', '::ffff:127.0.0.1']) {
      expect(isBlockedAddress(ip)).toBe(true)
    }
  })
  it('allows a public IPv6 and a mapped public IPv4', () => {
    expect(isBlockedAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(false)
    expect(isBlockedAddress('::ffff:93.184.216.34')).toBe(false)
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res('<meta property="og:title" content="Hi">')))
    const out = await unfurlLink('https://example.com/p')
    expect(out.title).toBe('Hi')
  })

  it('follows a redirect to a final page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res('', { status: 301, location: 'https://example.com/final' }))
      .mockResolvedValueOnce(res('<title>Final</title>'))
    vi.stubGlobal('fetch', fetchMock)
    const out = await unfurlLink('https://example.com/start')
    expect(out.title).toBe('Final')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up on a redirect with no Location', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res('', { status: 302 })))
    expect((await unfurlLink('https://example.com/x')).title).toBeNull()
  })

  it('returns empty for a redirect to a non-http scheme', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res('', { status: 301, location: 'ftp://example.com/x' })))
    expect((await unfurlLink('https://example.com/x')).title).toBeNull()
  })

  it('returns empty on a non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res('nope', { status: 404 })))
    expect((await unfurlLink('https://example.com/x')).image).toBeNull()
  })

  it('returns empty for a non-HTML content type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res('{}', { ct: 'application/json' })))
    expect((await unfurlLink('https://example.com/x')).title).toBeNull()
  })

  it('reads a body that exposes no reader via text()', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res('<title>Texted</title>', { body: 'none' })))
    expect((await unfurlLink('https://example.com/x')).title).toBe('Texted')
  })

  it('caps an oversized body', async () => {
    const big = '<title>' + 'a'.repeat(600 * 1024) + '</title>'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(big)))
    // Drives the byte-cap exit in the body reader; parsing still succeeds here.
    const out = await unfurlLink('https://example.com/x')
    expect(out.url).toBe('https://example.com/x')
  })

  it('refuses a literal private IP host without fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await unfurlLink('http://10.0.0.1/admin')).title).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows a literal public IP host without a DNS lookup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res('<title>IP</title>')))
    expect((await unfurlLink('http://93.184.216.34/p')).title).toBe('IP')
    expect(lookup).not.toHaveBeenCalled()
  })

  it('refuses a hostname that resolves to a private address', async () => {
    lookup.mockResolvedValue([{ address: '10.1.2.3', family: 4 }])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await unfurlLink('https://evil.test/x')).title).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses localhost-style hostnames', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await unfurlLink('http://localhost/x')).title).toBeNull()
    expect((await unfurlLink('http://db.internal/x')).title).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a hostname that does not resolve', async () => {
    lookup.mockResolvedValue([])
    vi.stubGlobal('fetch', vi.fn())
    expect((await unfurlLink('https://void.test/x')).title).toBeNull()
  })

  it('gives up after too many redirects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res('', { status: 301, location: 'https://example.com/loop' })))
    expect((await unfurlLink('https://example.com/loop')).title).toBeNull()
  })

  it('swallows a network/timeout error into an empty preview', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('aborted')))
    expect((await unfurlLink('https://example.com/x')).title).toBeNull()
  })

  it('serves a cached result without re-fetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res('<title>Once</title>'))
    vi.stubGlobal('fetch', fetchMock)
    await unfurlLink('https://example.com/cache')
    const out = await unfurlLink('https://example.com/cache')
    expect(out.title).toBe('Once')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('evicts the oldest entry once the cache is full', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res('<title>x</title>')))
    for (let i = 0; i < 501; i++) await unfurlLink(`https://example.com/p${i}`)
    // No assertion beyond not throwing: this drives the eviction branch.
    expect((await unfurlLink('https://example.com/p500')).title).toBe('x')
  })
})
