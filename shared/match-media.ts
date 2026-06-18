import type { MatchStatus } from './types/match'

export const MATCH_MEDIA_KINDS = ['LIVE', 'REPLAY', 'HIGHLIGHTS'] as const
export type MatchMediaKind = (typeof MATCH_MEDIA_KINDS)[number]

// A media item as the API exposes it to clients: `embeddable` is already
// resolved (override ?? host-whitelist default), so the UI just renders on it.
// `sandbox` and `allow` stay as the raw admin overrides (null = default): the
// final iframe attributes are resolved client-side by resolveEmbedAttrs, which
// needs the request host to build provider player URLs.
export interface MatchMediaItem {
  id: string
  kind: MatchMediaKind
  url: string
  label: string | null
  embeddable: boolean
  sandbox: boolean | null
  allow: string | null
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

// The default iframe feature-policy. Admins can override per link (e.g. paste a
// provider's own tag), but most embeds want exactly this.
export const DEFAULT_EMBED_ALLOW = 'autoplay; fullscreen; encrypted-media; picture-in-picture'

// The sandbox tokens for a recognised provider's player (safe to grant
// same-origin) vs an untrusted force-embedded host (no same-origin, so it can't
// reach our origin). `null` from resolveEmbedAttrs.sandbox means: emit NO sandbox
// attribute at all (a host that refuses to run sandboxed, e.g. some PPV players).
const PLAYER_SANDBOX = 'allow-scripts allow-same-origin allow-presentation'
const STRICT_SANDBOX = 'allow-scripts allow-presentation'

// Keep an admin-supplied `allow` to bare feature tokens (e.g. "autoplay;
// encrypted-media; picture-in-picture"): lowercase letters/dashes, separated by
// ';'. Drops anything else (origin lists, quotes, scripts) and caps the length,
// so a pasted value can never inject other iframe attributes or markup. Returns
// null when nothing usable survives, so the default applies.
export function sanitizeAllow(raw: string | null | undefined): string | null {
  if (!raw) return null
  const tokens = raw
    .toLowerCase()
    .split(';')
    .map((t) => t.trim())
    .filter((t) => /^[a-z][a-z-]*$/.test(t))
  if (!tokens.length) return null
  return [...new Set(tokens)].join('; ').slice(0, 200)
}

// Pull the src (and any allow) out of a pasted "<iframe ...>" tag so an admin can
// drop in a provider's own embed code and we keep just the parts we need. Returns
// null when the input isn't an iframe tag (the caller then treats it as a URL).
export function parseIframeEmbed(input: string): { url: string; allow: string | null } | null {
  if (!/<iframe[\s>]/i.test(input)) return null
  const src = input.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]
  if (!src) return null
  const allow = input.match(/\ballow\s*=\s*["']([^"']*)["']/i)?.[1]
  return { url: src.trim(), allow: sanitizeAllow(allow) }
}

export interface ResolvedEmbed {
  src: string
  // `undefined` => render no sandbox attribute (a host that refuses sandboxing).
  sandbox: string | undefined
  allow: string
  // The two policies a trusted player / raw host get; narrowed (not bare string)
  // so it satisfies the iframe element's referrerpolicy attribute type.
  referrerpolicy: 'strict-origin-when-cross-origin' | 'no-referrer'
}

// Resolve the final iframe attributes from the item's overrides + host. sandbox:
// null = the per-trust default, true = force the player sandbox, false = none.
// allow: the override or the default. referrerpolicy follows trust (a recognised
// player gets the origin it needs to authorise the embed; a raw host gets none).
export function resolveEmbedAttrs(
  item: { url: string; sandbox: boolean | null; allow: string | null },
  host: string,
): ResolvedEmbed {
  const target = embedTargetFor(item.url, host)
  const trusted = target?.trusted ?? false
  const sandbox =
    item.sandbox === false ? undefined : item.sandbox === true ? PLAYER_SANDBOX : trusted ? PLAYER_SANDBOX : STRICT_SANDBOX
  return {
    src: target?.src ?? item.url,
    sandbox,
    allow: sanitizeAllow(item.allow) ?? DEFAULT_EMBED_ALLOW,
    referrerpolicy: trusted ? 'strict-origin-when-cross-origin' : 'no-referrer',
  }
}
