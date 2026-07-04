import type { ShareFont } from './render'

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
// another script (CJK, Arabic, Hebrew, Indic...) would render as tofu boxes.
// satori asks for a font per uncovered script via loadAdditionalAsset; fetch the
// matching Noto subset from Google Fonts (just the needed glyphs), cached for the
// process. A failure resolves to no font (the glyph tofus, as before) - never a
// broken render.
const SCRIPT_FAMILY: Record<string, string> = {
  ja: 'Noto Sans JP',
  ko: 'Noto Sans KR',
  zh: 'Noto Sans SC',
  'zh-tw': 'Noto Sans TC',
  'zh-hk': 'Noto Sans HK',
  th: 'Noto Sans Thai',
  ar: 'Noto Sans Arabic',
  he: 'Noto Sans Hebrew',
  hi: 'Noto Sans Devanagari',
  bn: 'Noto Sans Bengali',
  ta: 'Noto Sans Tamil',
  unknown: 'Noto Sans',
}
const fallbackFontCache = new Map<string, Promise<ShareFont[]>>()
async function fetchGoogleFont(family: string, text: string): Promise<Buffer | null> {
  try {
    // No browser UA, so Google serves a TrueType src (satori can't parse woff2).
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&text=${encodeURIComponent(text)}`,
    ).then((r) => (r.ok ? r.text() : ''))
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1]
    if (!url) return null
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}
function loadFallbackFont(code: string, text: string): Promise<ShareFont[]> {
  const family = SCRIPT_FAMILY[code.toLowerCase()] ?? SCRIPT_FAMILY[code.split('-')[0]!.toLowerCase()] ?? 'Noto Sans'
  const key = `${family}::${text}`
  let cached = fallbackFontCache.get(key)
  if (!cached) {
    cached = (async () => {
      const data = await fetchGoogleFont(family, text)
      return data ? [{ name: family, data, weight: 400 as const, style: 'normal' as const }] : []
    })()
    fallbackFontCache.set(key, cached)
  }
  return cached
}
export async function shareLoadAdditionalAsset(code: string, segment: string): Promise<ShareFont[]> {
  if (code === 'emoji' || !segment.trim()) return []
  return loadFallbackFont(code, segment)
}
