import { describe, it, expect } from 'vitest'
import {
  embedTargetFor,
  isValidStreamUrl,
  isWhitelistedStreamHost,
  resolveEmbeddable,
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
