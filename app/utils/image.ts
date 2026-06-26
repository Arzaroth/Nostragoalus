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
