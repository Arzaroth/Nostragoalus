// Turn a raw session User-Agent string into a friendly device label for the
// connected-devices list. Deliberately tiny: enough OS/browser buckets to make
// a session recognisable ("iPhone - Safari"), not a full UA database. Order in
// each detector matters - the more specific token wins (Edge before Chrome,
// Chrome before Safari, because those UAs stack every prior engine's token).

export type DeviceKind = 'mobile' | 'tablet' | 'desktop' | 'unknown'

export interface ParsedUserAgent {
  os: string
  browser: string
  kind: DeviceKind
  // PrimeIcons class for the device kind.
  icon: string
}

function detectOs(ua: string): { os: string; kind: DeviceKind } {
  if (/iPhone/i.test(ua)) return { os: 'iPhone', kind: 'mobile' }
  if (/iPad/i.test(ua)) return { os: 'iPad', kind: 'tablet' }
  // Android tablets omit "Mobile"; phones include it.
  if (/Android/i.test(ua)) return { os: 'Android', kind: /Mobile/i.test(ua) ? 'mobile' : 'tablet' }
  if (/Windows/i.test(ua)) return { os: 'Windows', kind: 'desktop' }
  if (/Macintosh|Mac OS X/i.test(ua)) return { os: 'macOS', kind: 'desktop' }
  if (/CrOS/i.test(ua)) return { os: 'ChromeOS', kind: 'desktop' }
  if (/Linux/i.test(ua)) return { os: 'Linux', kind: 'desktop' }
  return { os: 'Unknown', kind: 'unknown' }
}

function detectBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Edge'
  if (/OPR\/|Opera/i.test(ua)) return 'Opera'
  if (/Firefox\//i.test(ua)) return 'Firefox'
  if (/Chrome\//i.test(ua)) return 'Chrome'
  // Safari's UA carries no Chrome/Chromium token.
  if (/Safari\//i.test(ua)) return 'Safari'
  return 'Unknown'
}

const KIND_ICON: Record<DeviceKind, string> = {
  mobile: 'pi pi-mobile',
  tablet: 'pi pi-tablet',
  desktop: 'pi pi-desktop',
  unknown: 'pi pi-question-circle',
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const raw = (ua ?? '').trim()
  if (!raw) return { os: 'Unknown', browser: 'Unknown', kind: 'unknown', icon: KIND_ICON.unknown }
  const { os, kind } = detectOs(raw)
  return { os, browser: detectBrowser(raw), kind, icon: KIND_ICON[kind] }
}

// "iPhone - Safari", collapsing to a single token when the other is unknown, or
// a generic fallback when nothing is recognised.
export function deviceLabel(ua: string | null | undefined, unknownLabel: string): string {
  const { os, browser } = parseUserAgent(ua)
  const knownOs = os !== 'Unknown'
  const knownBrowser = browser !== 'Unknown'
  if (knownOs && knownBrowser) return `${os} - ${browser}`
  if (knownOs) return os
  if (knownBrowser) return browser
  return unknownLabel
}
