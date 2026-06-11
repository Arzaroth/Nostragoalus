// Some IdPs map a profile picture that a browser <img> can never load - e.g.
// Microsoft Graph's `me/photo/$value`, which needs the user's OAuth token, so
// it 401s and shows as a broken avatar. We fetch it server-side once (with the
// stored access token) and inline it as a data URL; if that fails it's dropped
// so the placeholder shows. Public CDN pictures (Google lh3, etc.) and uploaded
// data: URLs are kept untouched.
export function isUnusableAvatarUrl(image: string | null | undefined): boolean {
  if (!image) return false
  return /(^https?:\/\/)?graph\.microsoft\.com\//i.test(image)
}

// A 240px thumbnail keeps the inlined data URL small; the stored claim is the
// full-size `/photo/$value`.
function thumbnailUrl(url: string): string {
  return url.replace(/\/photo\/\$value\b/, '/photos/240x240/$value')
}

const MAX_AVATAR_BYTES = 512 * 1024

// Fetch a token-gated IdP avatar and return it as a data URL, or null on any
// problem (no/short response, non-image, too large, network/auth error) - the
// caller then falls back to the placeholder. Best-effort: never throws.
export async function fetchAvatarDataUrl(
  url: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(thumbnailUrl(url), { headers: { authorization: `Bearer ${accessToken}` } })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > MAX_AVATAR_BYTES) return null
    return `data:${contentType};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
