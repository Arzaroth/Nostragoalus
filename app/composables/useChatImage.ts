// Client-side image prep for chat. Validates the file is an allowed image within
// the size cap, then downscales and re-encodes it to webp on a canvas before it
// is encrypted - so we ship a small, uniform format and never the original. Lives
// here (not app/utils) because it needs the DOM canvas/Image APIs.

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB on the original
const MAX_DIMENSION = 1600 // longest edge after downscale
const WEBP_QUALITY = 0.9 // near-lossless, much smaller than the source

export function isAcceptedImage(file: File): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type) && file.size <= MAX_IMAGE_BYTES
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('could not decode image'))
    }
    img.src = url
  })
}

// Returns the webp bytes (ready to encrypt) and the original byte size, or null if
// the file is not an acceptable image.
export async function compressToWebp(file: File): Promise<{ bytes: Uint8Array; byteSize: number } | null> {
  if (!isAcceptedImage(file)) return null
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas context')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY))
  if (!blob) throw new Error('could not encode image')
  return { bytes: new Uint8Array(await blob.arrayBuffer()), byteSize: file.size }
}
