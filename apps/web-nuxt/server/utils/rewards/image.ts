import type { StorageDriver } from '../storage/driver'
import { rewardKey } from '../storage/keys'
import { ValidationError } from '../errors'

// The image content types a reward accepts, matching the storage layer's canonical
// set. Rejected here so an unusable payload never reaches the driver or the key hash.
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const MAX_REWARD_BYTES = 512 * 1024

// A base64 data: URL, e.g. `data:image/png;base64,...`. Reward images arrive base64
// (client upload), so a url-encoded data URL is rejected rather than mis-parsed.
const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/s

// Move a reward image data URL's bytes into object storage and return the stored
// KEY (e.g. "reward/abc123.webp"), not a URL. The caller persists the key and builds
// the /api/media/reward/<key> serving URL itself.
export async function storeRewardFromDataUrl(driver: StorageDriver, dataUrl: string): Promise<string> {
  const m = DATA_URL_RE.exec(dataUrl)
  if (!m) throw new ValidationError('reward image must be a base64 data URL')
  const contentType = m[1]
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) throw new ValidationError('reward image must be a jpeg, png, webp or gif')
  const bytes = new Uint8Array(Buffer.from(m[2], 'base64'))
  if (bytes.length === 0 || bytes.length > MAX_REWARD_BYTES) throw new ValidationError('reward image is empty or too large')
  const key = rewardKey(bytes, contentType)
  await driver.put(key, bytes, contentType)
  return key
}
