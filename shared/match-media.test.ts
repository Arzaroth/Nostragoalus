import { describe, it, expect } from 'vitest'
import {
  DEFAULT_EMBED_ALLOW,
  embedTargetFor,
  isValidStreamUrl,
  isWhitelistedStreamHost,
  parseIframeEmbed,
  resolveEmbeddable,
  resolveEmbedAttrs,
  sanitizeAllow,
  visibleMediaForStatus,
  type MatchMediaItem,
} from './match-media'

describe('isValidStreamUrl', () => {
  it('accepts https, rejects http and garbage', () => {
    expect(isValidStreamUrl('https://example.com/x')).toBe(true)
    expect(isValidStreamUrl('http://example.com/x')).toBe(false)
    expect(isValidStreamUrl('javascript:alert(1)')).toBe(false)
    expect(isValidStreamUrl('not a url')).toBe(false)
  })
})

describe('embedTargetFor (whitelist transforms + trust)', () => {
  const HOST = 'goal.arzaroth.com'

  it('youtube: watch / youtu.be / embed / live / shorts -> trusted nocookie embed', () => {
    expect(embedTargetFor('https://www.youtube.com/watch?v=abc123', HOST)).toEqual({ src: 'https://www.youtube-nocookie.com/embed/abc123', trusted: true })
    expect(embedTargetFor('https://youtu.be/abc123', HOST)?.src).toBe('https://www.youtube-nocookie.com/embed/abc123')
    expect(embedTargetFor('https://www.youtube.com/embed/abc123', HOST)?.src).toBe('https://www.youtube-nocookie.com/embed/abc123')
    expect(embedTargetFor('https://www.youtube.com/live/abc123', HOST)?.src).toBe('https://www.youtube-nocookie.com/embed/abc123')
    expect(embedTargetFor('https://www.youtube.com/shorts/abc123', HOST)?.src).toBe('https://www.youtube-nocookie.com/embed/abc123')
  })

  it('twitch: live channel and VOD carry the parent host; bare /videos is not a player', () => {
    expect(embedTargetFor('https://www.twitch.tv/somechannel', HOST)?.src).toBe(`https://player.twitch.tv/?channel=somechannel&parent=${HOST}`)
    expect(embedTargetFor('https://twitch.tv/videos/12345', HOST)?.src).toBe(`https://player.twitch.tv/?video=12345&parent=${HOST}`)
    // bare /videos (no id) must not become channel=videos; not a derivable player.
    expect(isWhitelistedStreamHost('https://twitch.tv/videos')).toBe(false)
  })

  it('dailymotion and vimeo map to their players', () => {
    expect(embedTargetFor('https://www.dailymotion.com/video/x9abc', HOST)?.src).toBe('https://www.dailymotion.com/embed/video/x9abc')
    expect(embedTargetFor('https://dai.ly/x9abc', HOST)?.src).toBe('https://www.dailymotion.com/embed/video/x9abc')
    expect(embedTargetFor('https://vimeo.com/76543', HOST)?.src).toBe('https://player.vimeo.com/video/76543')
  })

  it('untrusted raw URL for an unknown host (admin force-embed)', () => {
    expect(embedTargetFor('https://sketchystream.example/match/42', HOST)).toEqual({ src: 'https://sketchystream.example/match/42', trusted: false })
  })

  it('returns null for an unparseable URL', () => {
    expect(embedTargetFor('::::', HOST)).toBeNull()
  })
})

describe('isWhitelistedStreamHost', () => {
  it('is true only when a provider yields a real embed src', () => {
    expect(isWhitelistedStreamHost('https://www.youtube.com/watch?v=abc123')).toBe(true)
    expect(isWhitelistedStreamHost('https://music.youtube.com/watch?v=abc123')).toBe(true)
    // recognised host but no derivable player (bare channel root, no video id)
    expect(isWhitelistedStreamHost('https://www.youtube.com/watch')).toBe(false)
    expect(isWhitelistedStreamHost('https://youtu.be/')).toBe(false)
    expect(isWhitelistedStreamHost('https://www.youtube.com/channel/UCabc')).toBe(false)
    expect(isWhitelistedStreamHost('https://www.twitch.tv/foo/bar/baz')).toBe(false)
    expect(isWhitelistedStreamHost('https://www.dailymotion.com/about')).toBe(false)
    expect(isWhitelistedStreamHost('https://vimeo.com/channels')).toBe(false)
    // unknown / not-youtube lookalike / invalid
    expect(isWhitelistedStreamHost('https://notyoutube.com/watch?v=abc')).toBe(false)
    expect(isWhitelistedStreamHost('https://sketchystream.example/x')).toBe(false)
    expect(isWhitelistedStreamHost('http://www.youtube.com/watch?v=abc')).toBe(false)
  })
})

describe('resolveEmbeddable', () => {
  it('override wins, else the whitelist default', () => {
    const yt = 'https://www.youtube.com/watch?v=abc123'
    const grey = 'https://sketchystream.example/x'
    expect(resolveEmbeddable(yt, null)).toBe(true)
    expect(resolveEmbeddable(yt, undefined)).toBe(true)
    expect(resolveEmbeddable(yt, false)).toBe(false)
    expect(resolveEmbeddable(grey, null)).toBe(false)
    expect(resolveEmbeddable(grey, true)).toBe(true)
  })
})

describe('visibleMediaForStatus', () => {
  const media: Pick<MatchMediaItem, 'kind'>[] = [{ kind: 'LIVE' }, { kind: 'REPLAY' }, { kind: 'HIGHLIGHTS' }]

  it('shows LIVE before/at the match and replay/highlights once over (FINISHED or AWARDED)', () => {
    expect(visibleMediaForStatus(media, 'SCHEDULED').map((m) => m.kind)).toEqual(['LIVE'])
    expect(visibleMediaForStatus(media, 'LIVE').map((m) => m.kind)).toEqual(['LIVE'])
    expect(visibleMediaForStatus(media, 'FINISHED').map((m) => m.kind)).toEqual(['REPLAY', 'HIGHLIGHTS'])
    expect(visibleMediaForStatus(media, 'AWARDED').map((m) => m.kind)).toEqual(['REPLAY', 'HIGHLIGHTS'])
  })
})

describe('sanitizeAllow', () => {
  it('keeps bare feature tokens, lowercased and deduped', () => {
    expect(sanitizeAllow('autoplay; encrypted-media; picture-in-picture')).toBe('autoplay; encrypted-media; picture-in-picture')
    expect(sanitizeAllow('Autoplay; AUTOPLAY; fullscreen')).toBe('autoplay; fullscreen')
  })
  it('drops anything that is not a token (origins, quotes, markup, scripts)', () => {
    expect(sanitizeAllow("autoplay; camera 'self'; <script>")).toBe('autoplay')
    expect(sanitizeAllow('"><img src=x>')).toBeNull()
  })
  it('returns null for empty / nullish', () => {
    expect(sanitizeAllow('')).toBeNull()
    expect(sanitizeAllow(null)).toBeNull()
    expect(sanitizeAllow(undefined)).toBeNull()
  })
  it('caps the length', () => {
    // Distinct, digit-free tokens (the policy grammar is letters + dashes), so
    // they all survive and overflow the cap.
    const long = Array.from({ length: 60 }, (_, i) => 'a'.repeat(i + 2)).join('; ')
    expect(sanitizeAllow(long)!.length).toBeLessThanOrEqual(200)
  })
})

describe('parseIframeEmbed', () => {
  it('extracts src and allow from a pasted iframe tag', () => {
    const tag = '<iframe width="560" src="https://www.youtube.com/embed/abc?si=zz" title="x" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>'
    expect(parseIframeEmbed(tag)).toEqual({ url: 'https://www.youtube.com/embed/abc?si=zz', allow: 'autoplay; encrypted-media; picture-in-picture' })
  })
  it('returns the src with null allow when there is no allow attribute', () => {
    expect(parseIframeEmbed("<iframe src='https://ppv.example/embed/x'></iframe>")).toEqual({ url: 'https://ppv.example/embed/x', allow: null })
  })
  it('returns null for a plain URL or an iframe with no src', () => {
    expect(parseIframeEmbed('https://www.youtube.com/watch?v=abc')).toBeNull()
    expect(parseIframeEmbed('<iframe width="560"></iframe>')).toBeNull()
  })
})

describe('resolveEmbedAttrs', () => {
  const HOST = 'goal.arzaroth.com'
  const item = (over: Partial<{ url: string; sandbox: boolean | null; allow: string | null }> = {}) => ({
    url: 'https://www.youtube.com/watch?v=abc123',
    sandbox: null,
    allow: null,
    ...over,
  })

  it('trusted player: nocookie src, player sandbox + same-origin referrer, default allow', () => {
    expect(resolveEmbedAttrs(item(), HOST)).toEqual({
      src: 'https://www.youtube-nocookie.com/embed/abc123',
      sandbox: 'allow-scripts allow-same-origin allow-presentation',
      allow: DEFAULT_EMBED_ALLOW,
      referrerpolicy: 'strict-origin-when-cross-origin',
    })
  })
  it('untrusted host: raw src, strict sandbox, no referrer', () => {
    const r = resolveEmbedAttrs(item({ url: 'https://ppv.example/embed/x' }), HOST)
    expect(r.src).toBe('https://ppv.example/embed/x')
    expect(r.sandbox).toBe('allow-scripts allow-presentation')
    expect(r.referrerpolicy).toBe('no-referrer')
  })
  it('sandbox=false drops the attribute entirely', () => {
    expect(resolveEmbedAttrs(item({ url: 'https://ppv.example/embed/x', sandbox: false }), HOST).sandbox).toBeUndefined()
  })
  it('sandbox=true forces the player sandbox even on an untrusted host', () => {
    expect(resolveEmbedAttrs(item({ url: 'https://ppv.example/embed/x', sandbox: true }), HOST).sandbox).toBe('allow-scripts allow-same-origin allow-presentation')
  })
  it('allow override is sanitised then used', () => {
    expect(resolveEmbedAttrs(item({ allow: "autoplay; camera 'self'" }), HOST).allow).toBe('autoplay')
  })
})
