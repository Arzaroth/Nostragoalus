// Some IdPs map a profile picture that a browser <img> can never load - e.g.
// Microsoft Graph's `me/photo/$value`, which needs the user's OAuth token, so
// it 401s and shows as a broken avatar. Such URLs are dropped at provisioning
// (the user falls back to the placeholder and any later upload sticks). Public
// CDN pictures (Google lh3, etc.) and uploaded data: URLs are kept.
export function isUnusableAvatarUrl(image: string | null | undefined): boolean {
  if (!image) return false
  return /(^https?:\/\/)?graph\.microsoft\.com\//i.test(image)
}
