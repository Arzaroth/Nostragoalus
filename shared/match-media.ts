import type { MatchStatus } from './types/match'

export const MATCH_MEDIA_KINDS = ['LIVE', 'REPLAY', 'HIGHLIGHTS'] as const
export type MatchMediaKind = (typeof MATCH_MEDIA_KINDS)[number]

// A media item as the API exposes it to clients: `embeddable` is already
// resolved (override ?? host-whitelist default), so the UI just renders on it.
export interface MatchMediaItem {
  id: string
  kind: MatchMediaKind
  url: string
  label: string | null
  embeddable: boolean
}

interface EmbedProvider {
  id: string
  matches: (u: URL) => boolean
  // Build the iframe src, or null when this URL has no embeddable player form
  // (e.g. a channel root we can't turn into a stream). `host` feeds providers
  // that pin the embedding domain - Twitch rejects an embed without `parent`.
  toEmbedSrc: (u: URL, host: string) => string | null
}

function youtubeId(u: URL): string | null {
  if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null
  if (u.pathname === '/watch') return u.searchParams.get('v')
  const m = u.pathname.match(/^\/(?:embed|live|shorts)\/([\w-]+)/)
  return m ? m[1] : null
}

const PROVIDERS: EmbedProvider[] = [
  {
    id: 'youtube',
    matches: (u) => u.hostname === 'youtu.be' || /(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname),
    toEmbedSrc: (u) => {
      const id = youtubeId(u)
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
    },
  },
  {
    id: 'twitch',
    matches: (u) => /(^|\.)twitch\.tv$/.test(u.hostname),
    toEmbedSrc: (u, host) => {
      const parts = u.pathname.split('/').filter(Boolean)
      // twitch.tv/videos/<id> is a VOD; twitch.tv/<channel> is the live channel.
      // A bare /videos (no id) is neither, so it must not become channel=videos.
      if (parts[0] === 'videos') return parts[1] ? `https://player.twitch.tv/?video=${parts[1]}&parent=${host}` : null
      if (parts.length === 1) return `https://player.twitch.tv/?channel=${parts[0]}&parent=${host}`
      return null
    },
  },
  {
    id: 'dailymotion',
    matches: (u) => /(^|\.)dailymotion\.com$/.test(u.hostname) || u.hostname === 'dai.ly',
    toEmbedSrc: (u) => {
      const id = u.hostname === 'dai.ly' ? u.pathname.slice(1) : u.pathname.match(/^\/video\/(\w+)/)?.[1]
      return id ? `https://www.dailymotion.com/embed/video/${id}` : null
    },
  },
  {
    id: 'vimeo',
    matches: (u) => /(^|\.)vimeo\.com$/.test(u.hostname),
    toEmbedSrc: (u) => {
      const id = u.pathname.match(/\/(\d+)/)?.[1]
      return id ? `https://player.vimeo.com/video/${id}` : null
    },
  },
]

function parseHttps(url: string): URL | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  // https only: blocks javascript:/data: schemes and dodges mixed-content blocks.
  return u.protocol === 'https:' ? u : null
}

export function isValidStreamUrl(url: string): boolean {
  return parseHttps(url) !== null
}

function findProvider(u: URL): EmbedProvider | null {
  return PROVIDERS.find((p) => p.matches(u)) ?? null
}

// A host is whitelisted when we recognise the provider AND can derive a real
// embed src from this URL - a bare channel root that yields no player is not
// auto-embeddable.
export function isWhitelistedStreamHost(url: string): boolean {
  const u = parseHttps(url)
  if (!u) return false
  const p = findProvider(u)
  return !!p && p.toEmbedSrc(u, 'localhost') !== null
}

// The effective embeddable flag: an explicit admin override wins, else the
// host-whitelist default. Recomputed from the override on every read, so editing
// the whitelist later moves every non-overridden link with it.
export function resolveEmbeddable(url: string, override: boolean | null | undefined): boolean {
  return override ?? isWhitelistedStreamHost(url)
}

export interface EmbedTarget {
  src: string
  // `trusted` is true for a recognised provider's player URL (safe to grant the
  // player sandbox: allow-scripts + allow-same-origin). It is false for an
  // admin-forced raw URL of an unrecognised host - the caller must then use a
  // strict sandbox (no allow-same-origin) so a hostile page can't escape it.
  trusted: boolean
}

// What to load once we've decided to embed. A recognised provider yields its
// transformed player (trusted); an admin force-embedded non-whitelisted host
// yields the raw URL (untrusted, must be strictly sandboxed). null only for a
// URL we can't even parse.
export function embedTargetFor(url: string, host: string): EmbedTarget | null {
  const u = parseHttps(url)
  if (!u) return null
  const providerSrc = findProvider(u)?.toEmbedSrc(u, host)
  return providerSrc ? { src: providerSrc, trusted: true } : { src: url, trusted: false }
}

// LIVE links belong to the build-up and the match itself; once the match is over
// (FINISHED or AWARDED by walkover/forfeit) only the replay/highlights stay
// relevant. Anything else (scheduled, live, suspended, postponed, cancelled)
// keeps the pre-match/in-play LIVE slot.
export function visibleMediaForStatus<T extends { kind: MatchMediaKind }>(media: T[], status: MatchStatus): T[] {
  const over = status === 'FINISHED' || status === 'AWARDED'
  const allowed: MatchMediaKind[] = over ? ['REPLAY', 'HIGHLIGHTS'] : ['LIVE']
  return media.filter((m) => allowed.includes(m.kind))
}
