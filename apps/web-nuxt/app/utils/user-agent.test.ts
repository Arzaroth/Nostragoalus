import { describe, it, expect } from 'vitest'
import { deviceLabel, parseUserAgent } from './user-agent'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const WINDOWS_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0'
const CHROMEOS_CHROME =
  'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const WINDOWS_OPERA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0'

describe('parseUserAgent', () => {
  it('identifies OS, browser and device kind across common agents', () => {
    expect(parseUserAgent(IPHONE_SAFARI)).toMatchObject({ os: 'iPhone', browser: 'Safari', kind: 'mobile', icon: 'pi pi-mobile' })
    expect(parseUserAgent(IPAD_SAFARI)).toMatchObject({ os: 'iPad', browser: 'Safari', kind: 'tablet', icon: 'pi pi-tablet' })
    expect(parseUserAgent(ANDROID_CHROME)).toMatchObject({ os: 'Android', browser: 'Chrome', kind: 'mobile' })
    expect(parseUserAgent(ANDROID_TABLET)).toMatchObject({ os: 'Android', browser: 'Chrome', kind: 'tablet' })
    expect(parseUserAgent(MAC_SAFARI)).toMatchObject({ os: 'macOS', browser: 'Safari', kind: 'desktop', icon: 'pi pi-desktop' })
    expect(parseUserAgent(LINUX_FIREFOX)).toMatchObject({ os: 'Linux', browser: 'Firefox', kind: 'desktop' })
    expect(parseUserAgent(CHROMEOS_CHROME)).toMatchObject({ os: 'ChromeOS', browser: 'Chrome', kind: 'desktop' })
  })

  it('prefers the more specific browser token over the engine tokens it stacks', () => {
    // Edge/Opera/Chrome UAs all carry Safari/537.36; the specific token must win.
    expect(parseUserAgent(WINDOWS_EDGE)).toMatchObject({ os: 'Windows', browser: 'Edge' })
    expect(parseUserAgent(WINDOWS_OPERA)).toMatchObject({ os: 'Windows', browser: 'Opera' })
    expect(parseUserAgent(MAC_CHROME).browser).toBe('Chrome')
  })

  it('falls back to Unknown for empty, nullish or unrecognised input', () => {
    expect(parseUserAgent(null)).toMatchObject({ os: 'Unknown', browser: 'Unknown', kind: 'unknown', icon: 'pi pi-question-circle' })
    expect(parseUserAgent('')).toMatchObject({ os: 'Unknown', kind: 'unknown' })
    expect(parseUserAgent('   ')).toMatchObject({ os: 'Unknown' })
    expect(parseUserAgent('curl/8.4.0')).toMatchObject({ os: 'Unknown', browser: 'Unknown' })
  })
})

describe('deviceLabel', () => {
  it('joins OS and browser when both are known', () => {
    expect(deviceLabel(IPHONE_SAFARI, 'Unknown device')).toBe('iPhone - Safari')
    expect(deviceLabel(WINDOWS_EDGE, 'Unknown device')).toBe('Windows - Edge')
  })

  it('collapses to the single known token', () => {
    // OS known, browser not.
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0)', 'Unknown device')).toBe('Windows')
    // Browser known, OS not.
    expect(deviceLabel('Firefox/127.0', 'Unknown device')).toBe('Firefox')
  })

  it('uses the fallback label when nothing is recognised', () => {
    expect(deviceLabel('curl/8.4.0', 'Unknown device')).toBe('Unknown device')
    expect(deviceLabel(null, 'Unknown device')).toBe('Unknown device')
  })
})
