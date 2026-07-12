// Resize + square-crop an image File to a small JPEG data URL (no upload infra).
export function resizeToDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas unsupported'))
      const scale = Math.max(size / img.width, size / img.height)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => reject(new Error('invalid image'))
    img.src = URL.createObjectURL(file)
  })
}

// Downscale + re-encode an image File to a webp data URL that fits a byte budget,
// aspect preserved (unlike resizeToDataUrl's square crop). For markdown league
// descriptions: the server reward store caps decoded bytes at 512KB, so shipping the
// raw file 422s. We cap the longest edge, then step quality down until the encoded
// blob fits the budget. Re-encodes everything to webp (animated GIFs lose animation).
export function downscaleToWebpDataUrl(
  file: File,
  { maxDimension = 1600, maxBytes = 480 * 1024 } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = async () => {
      URL.revokeObjectURL(url)
      try {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas unsupported'))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        // Base64 inflates ~33%, but the server checks the DECODED byte length, so we
        // size the blob itself. Step quality down until it fits, then hand back the URL.
        for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
          const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality))
          if (!blob) return reject(new Error('could not encode image'))
          if (blob.size <= maxBytes || quality === 0.45) {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(new Error('read failed'))
            reader.readAsDataURL(blob)
            return
          }
        }
      } catch (err) {
        reject(err instanceof Error ? err : new Error('downscale failed'))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('invalid image'))
    }
    img.src = url
  })
}

// Take a decrypted chat image (a webp blob) to PNG. Chat stores webp, but the
// clipboard only accepts PNG (Chromium rejects an image/webp ClipboardItem) and a
// PNG is the friendlier thing to download/share, so we transcode on the way out.
// Returns the original blob untouched if it is already PNG or the pipeline is
// unavailable (no DOM, decode failure) - the caller still gets a usable blob.
export async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return blob
  try {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close?.()
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return png ?? blob
  } catch {
    return blob
  }
}

// A filesystem-safe slug: lowercase, strip diacritics, non-alphanumerics to single
// dashes, trimmed. Empty input (or all-punctuation) yields ''.
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// nostragoalus-chat-{league}[-{match}]-{YYYY-MM-DD}.{ext}. A missing/blank league
// or match part is simply dropped, so the name stays clean.
export function chatImageFilename(opts: { league?: string; match?: string; date: Date; ext: string }): string {
  const parts = ['nostragoalus', 'chat']
  const league = slugify(opts.league ?? '')
  if (league) parts.push(league)
  const match = slugify(opts.match ?? '')
  if (match) parts.push(match)
  const y = opts.date.getFullYear()
  const m = String(opts.date.getMonth() + 1).padStart(2, '0')
  const d = String(opts.date.getDate()).padStart(2, '0')
  parts.push(`${y}-${m}-${d}`)
  return `${parts.join('-')}.${opts.ext}`
}
