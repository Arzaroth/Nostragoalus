import type { ShareFont } from './render'
import { fallbackFamilies } from './font-fallback'

// Shared bundled-asset + fallback-font loading for the OG share-card routes
// (prediction card and wrapped card). Kept in one place so both cards load the
// same fonts, memoize per process, and get the same non-Latin fallback loader -
// a copy in each route had already drifted (the wrapped route shipped without
// the fallback loader, tofu-boxing non-Latin names). This is I/O glue (storage
// reads + a Google Fonts fetch) exercised end-to-end, not by unit tests, so it
// is excluded from the coverage gate in vitest.config.ts alongside the other
// storage/DOM glue.

// Fonts are bundled server assets (assets:server): Latin/Cyrillic/Greek (Inter)
// and Thai (Noto Sans Thai). Read once and memoized - satori needs the raw font
// bytes on every render.
const FONT_FILES: Array<{ file: string; name: string; weight: 400 | 700 }> = [
  { file: 'fonts/Inter-400.woff', name: 'Inter', weight: 400 },
  { file: 'fonts/Inter-700.woff', name: 'Inter', weight: 700 },
  { file: 'fonts/NotoSansThai-400.woff', name: 'Noto Sans Thai', weight: 400 },
  { file: 'fonts/NotoSansThai-700.woff', name: 'Noto Sans Thai', weight: 700 },
]

let fontsPromise: Promise<ShareFont[]> | null = null
export function loadShareFonts(): Promise<ShareFont[]> {
  if (!fontsPromise) {
    const storage = useStorage('assets:server')
    fontsPromise = Promise.all(
      FONT_FILES.map(async (f) => {
        const raw = (await storage.getItemRaw(f.file)) as Uint8Array
        return { name: f.name, data: Buffer.from(raw), weight: f.weight, style: 'normal' as const }
      }),
    )
  }
  return fontsPromise
}

let markPromise: Promise<string | null> | null = null
export function loadShareMark(): Promise<string | null> {
  if (!markPromise) {
    markPromise = (async () => {
      try {
        const raw = (await useStorage('assets:server').getItemRaw('share-mark.svg')) as Uint8Array | null
        return raw ? `data:image/svg+xml;base64,${Buffer.from(raw).toString('base64')}` : null
      } catch {
        return null
      }
    })()
  }
  return markPromise
}

// Bundled fonts cover Latin/Cyrillic/Greek (Inter) and Thai; a username in
// another script (CJK, Arabic, Indic, Lisu...), a dingbat or an emoji would
// render as tofu boxes. satori asks for a font per uncovered run via
// loadAdditionalAsset; fetch the matching Noto subsets from Google Fonts (just
// the needed glyphs), cached for the process. Any failure resolves to no font
// (the glyph tofus, as before) - never a broken render.

// Bounded so a stream of distinct display names cannot grow the process
// unchecked; the whole map is dropped rather than evicted one by one, since a
// re-fetch is cheap and the common case is a warm handful of families.
const CACHE_MAX = 500
const FETCH_TIMEOUT_MS = 5_000
const fallbackFontCache = new Map<string, Promise<ShareFont[]>>()

// An sfnt/woff signature. Google answering with anything else (an error page, a
// woff2) must not reach satori, which throws on an unparseable buffer.
function isFontBuffer(buf: Buffer): boolean {
  const tag = buf.subarray(0, 4).toString('binary')
  return tag === '\x00\x01\x00\x00' || tag === 'true' || tag === 'OTTO' || tag === 'wOFF'
}

async function fetchGoogleFont(family: string, text: string): Promise<Buffer | null> {
  try {
    // No browser UA, so Google serves a TrueType src (satori can't parse woff2).
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&text=${encodeURIComponent(text)}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    ).then((r) => (r.ok ? r.text() : ''))
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1]
    if (!url) return null
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return isFontBuffer(buf) ? buf : null
  } catch {
    return null
  }
}

function loadFallbackFonts(code: string, text: string): Promise<ShareFont[]> {
  const families = fallbackFamilies(code, text)
  const key = `${families.join('|')}::${text}`
  const cached = fallbackFontCache.get(key)
  if (cached) return cached
  const pending = (async () => {
    const loaded = await Promise.all(
      families.map(async (family): Promise<ShareFont | null> => {
        const data = await fetchGoogleFont(family, text)
        // Each subset is scoped to its own run: satori keys registered fonts by
        // name, so two runs pulling different subsets of the same family (Noto
        // Sans for both a symbol run and a Cyrillic one) would collide and one
        // run's glyphs would tofu.
        return data ? { name: `${family}#${text}`, data, weight: 400, style: 'normal' } : null
      }),
    )
    return loaded.filter((f) => f !== null)
  })()
  if (fallbackFontCache.size >= CACHE_MAX) fallbackFontCache.clear()
  fallbackFontCache.set(key, pending)
  return pending
}

export async function shareLoadAdditionalAsset(code: string, segment: string): Promise<ShareFont[]> {
  if (!segment.trim()) return []
  return loadFallbackFonts(code, segment)
}
