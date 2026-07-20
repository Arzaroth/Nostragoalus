// Which Google-hosted font families to try for a run of text satori could not
// render with the bundled fonts. Pure string logic, kept out of og-assets.ts so
// it is unit-testable (that file is coverage-excluded I/O glue).
//
// satori labels each run with a code: a locale ("ar-AR", "ja-JP|zh-CN|..."), one
// of "emoji" / "symbol" / "math", or "unknown" for everything else.
const SCRIPT_FAMILY: Record<string, string> = {
  ja: 'Noto Sans JP',
  ko: 'Noto Sans KR',
  zh: 'Noto Sans SC',
  th: 'Noto Sans Thai',
  ar: 'Noto Sans Arabic',
  he: 'Noto Sans Hebrew',
  bn: 'Noto Sans Bengali',
  ta: 'Noto Sans Tamil',
  ml: 'Noto Sans Malayalam',
  te: 'Noto Sans Telugu',
  devanagari: 'Noto Sans Devanagari',
  kannada: 'Noto Sans Kannada',
  emoji: 'Noto Emoji',
}

// Noto names its families after the Unicode script, so an unlabelled run can
// pick its own font. Only scripts with a Google-hosted "Noto Sans <Script>" are
// listed; Latin, Cyrillic and Greek are deliberately absent because plain Noto
// Sans carries them.
const NOTO_SCRIPTS = `Adlam Anatolian_Hieroglyphs Arabic Armenian Avestan Balinese Bamum Bassa_Vah Batak
Bengali Bhaiksuki Brahmi Buginese Buhid Canadian_Aboriginal Carian Caucasian_Albanian Chakma Cham
Cherokee Chorasmian Coptic Cuneiform Cypriot Cypro_Minoan Deseret Devanagari Duployan
Egyptian_Hieroglyphs Elbasan Elymaic Ethiopic Georgian Glagolitic Gothic Grantha Gujarati
Gunjala_Gondi Gurmukhi Hanifi_Rohingya Hanunoo Hatran Hebrew Imperial_Aramaic Inscriptional_Pahlavi
Inscriptional_Parthian Javanese Kaithi Kannada Kawi Kayah_Li Kharoshthi Khmer Khojki Khudawadi Lao
Lepcha Limbu Linear_A Linear_B Lisu Lycian Lydian Mahajani Malayalam Mandaic Manichaean Marchen
Masaram_Gondi Medefaidrin Meetei_Mayek Mende_Kikakui Miao Modi Mongolian Mro Multani Myanmar
Nabataean Nag_Mundari Nandinagari New_Tai_Lue Newa Nushu Ogham Ol_Chiki Old_Hungarian Old_Italic
Old_North_Arabian Old_Permic Old_Persian Old_Sogdian Old_South_Arabian Old_Turkic Oriya Osage
Osmanya Pahawh_Hmong Palmyrene Pau_Cin_Hau Phags_Pa Phoenician Psalter_Pahlavi Rejang Runic
Samaritan Saurashtra Sharada Shavian Siddham SignWriting Sinhala Sogdian Sora_Sompeng Soyombo
Sundanese Syloti_Nagri Syriac Tagalog Tagbanwa Tai_Le Tai_Tham Tai_Viet Takri Tamil Tangsa Telugu
Thaana Thai Tifinagh Tirhuta Ugaritic Vai Vithkuqi Wancho Warang_Citi Yi Zanabazar_Square`.split(/\s+/)

// Script_Extensions, not Script, to match how satori itself classifies: it puts
// shared-script marks and punctuation with the script they extend.
function scriptFamilies(text: string): string[] {
  const found: string[] = []
  for (const script of NOTO_SCRIPTS) {
    try {
      if (new RegExp(`\\p{scx=${script}}`, 'u').test(text)) found.push(`Noto Sans ${script.replace(/_/g, ' ')}`)
    } catch {
      // A script name this runtime's Unicode tables predate must not take the
      // render down with it - the glyph tofus instead.
    }
  }
  return found
}

// Ordered candidates; the caller fetches each and hands satori every one that
// resolved, so it can fall back per glyph.
export function fallbackFamilies(code: string, text: string): string[] {
  const direct = SCRIPT_FAMILY[code.toLowerCase()] ?? SCRIPT_FAMILY[code.split('-')[0]!.toLowerCase()]
  if (direct) return [direct]
  // satori tests its symbol regex before its math one, so a math operator is
  // labelled "symbol" - try both families rather than trust the label.
  if (code === 'symbol' || code === 'math') return ['Noto Sans Symbols 2', 'Noto Sans Math', 'Noto Sans']
  // One "unknown" run can concatenate several scripts, and Latin/Cyrillic/Greek
  // land here too, so every detected script plus the Latin-carrying default.
  return [...scriptFamilies(text), 'Noto Sans']
}
