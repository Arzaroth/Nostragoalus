import type { ShareLocale } from './token'
import en from '../../../i18n/locales/en.json'
import fr from '../../../i18n/locales/fr.json'
import th from '../../../i18n/locales/th.json'
import tlh from '../../../i18n/locales/tlh.json'
import ar from '../../../i18n/locales/ar.json'

// Server-side translation for the share card, which is rendered by a crawler-
// facing route with no Vue/i18n context. Reads the SAME locale JSON the app
// uses (single source of truth), so card copy can't drift from the UI.
type Dict = Record<string, unknown>
const DICTS: Record<ShareLocale, Dict> = {
  en: en as Dict,
  fr: fr as Dict,
  th: th as Dict,
  tlh: tlh as Dict,
  ar: ar as Dict,
}

function lookup(dict: Dict, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (acc != null && typeof acc === 'object') return (acc as Dict)[part]
    return undefined
  }, dict)
  return typeof value === 'string' ? value : undefined
}

// vue-i18n named interpolation is {name}; mirror it. Missing keys fall back to
// English, then to the raw key (visible-but-not-crashing, like the app).
export function shareTranslator(locale: ShareLocale) {
  const dict = DICTS[locale] ?? DICTS.en
  return (key: string, params?: Record<string, string | number>): string => {
    const raw = lookup(dict, key) ?? lookup(DICTS.en, key) ?? key
    if (!params) return raw
    return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
      const v = params[name]
      return v == null ? `{${name}}` : String(v)
    })
  }
}

export type ShareTranslate = ReturnType<typeof shareTranslator>
