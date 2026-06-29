import { describe, it, expect } from 'vitest'
import { parseChangelog, compareVersions, latestVersion, isUnseen, selectLocaleChangelog } from './changelog'

const SAMPLE = `# Changelog

Some preamble that is not a version.

## [Unreleased]

### Added
- A shiny thing not yet released.

## [1.10.0] - 2026-06-17

### Added
- A feature with a [link](https://example.com).
- Another bullet.

### Fixed
- A bug.

## [1.9.0] - 2026-06-10

### Changed
- Reworked the thing.
`

describe('parseChangelog', () => {
  it('parses versions, dates, sections and bullets', () => {
    const v = parseChangelog(SAMPLE)
    expect(v).toHaveLength(2)
    expect(v[0]).toMatchObject({ version: '1.10.0', date: '2026-06-17' })
    expect(v[0].sections.map((s) => s.title)).toEqual(['Added', 'Fixed'])
    expect(v[0].sections[0].items).toEqual([
      'A feature with a [link](https://example.com).',
      'Another bullet.',
    ])
    expect(v[1]).toMatchObject({ version: '1.9.0', date: '2026-06-10' })
  })

  it('drops the [Unreleased] block', () => {
    const versions = parseChangelog(SAMPLE).map((v) => v.version)
    expect(versions).not.toContain('Unreleased')
  })

  it('handles a version header with no date', () => {
    const v = parseChangelog('## [2.0.0]\n\n### Added\n- thing\n')
    expect(v[0]).toMatchObject({ version: '2.0.0', date: '' })
  })

  it('ignores bullets before any section and sections before any version', () => {
    // A bullet with no preceding ### is dropped; a ### with no preceding ## too.
    const v = parseChangelog('### Stray\n- orphan\n## [1.0.0]\n- bullet-without-section\n')
    expect(v).toHaveLength(1)
    expect(v[0].sections).toEqual([])
  })

  it('returns an empty array for an empty changelog', () => {
    expect(parseChangelog('')).toEqual([])
  })
})

describe('compareVersions', () => {
  it('orders by numeric segments, not lexically', () => {
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1)
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
  })

  it('treats equal versions as 0', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('pads missing segments with zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.1', '1.2')).toBe(1)
  })

  it('falls back to a per-segment lexical compare on a non-numeric segment', () => {
    expect(compareVersions('1.2.x', '1.2.y')).toBe(-1)
    expect(compareVersions('1.2.y', '1.2.x')).toBe(1)
    expect(compareVersions('1.2.x', '1.2.x')).toBe(0)
    // Earlier numeric segments still order first: 10 > 9 decides before the
    // non-numeric tail is ever reached (a whole-string compare would invert it).
    expect(compareVersions('1.10.x', '1.9.x')).toBe(1)
  })
})

describe('latestVersion', () => {
  it('returns the newest version regardless of file order', () => {
    const versions = [
      { version: '1.9.0', date: '', sections: [] },
      { version: '1.10.0', date: '', sections: [] },
      { version: '1.2.0', date: '', sections: [] },
    ]
    expect(latestVersion(versions)).toBe('1.10.0')
  })

  it('returns null for an empty list', () => {
    expect(latestVersion([])).toBeNull()
  })
})

describe('isUnseen', () => {
  it('is true when the version is newer than last seen', () => {
    expect(isUnseen('1.10.0', '1.9.0')).toBe(true)
  })

  it('is false when the version is the same or older', () => {
    expect(isUnseen('1.9.0', '1.9.0')).toBe(false)
    expect(isUnseen('1.8.0', '1.9.0')).toBe(false)
  })

  it('is false when last seen is null/undefined/empty (not yet baselined)', () => {
    expect(isUnseen('1.10.0', null)).toBe(false)
    expect(isUnseen('1.10.0', undefined)).toBe(false)
    expect(isUnseen('1.10.0', '')).toBe(false)
  })
})

describe('selectLocaleChangelog', () => {
  const base = [
    { version: '1.10.0', date: '2026-06-17', sections: [{ title: 'Added', items: ['en feature'] }] },
    { version: '1.9.0', date: '2026-06-10', sections: [{ title: 'Changed', items: ['en change'] }] },
  ]

  it('returns the base unchanged when there is no localized list', () => {
    expect(selectLocaleChangelog(base, undefined)).toBe(base)
    expect(selectLocaleChangelog(base, [])).toBe(base)
  })

  it('overlays translated entries and keeps base order and completeness', () => {
    const localized = [
      { version: '1.10.0', date: '2026-06-17', sections: [{ title: 'Ajouté', items: ['fonctionnalité'] }] },
    ]
    const out = selectLocaleChangelog(base, localized)
    expect(out.map((v) => v.version)).toEqual(['1.10.0', '1.9.0'])
    // Translated version swapped in...
    expect(out[0].sections[0].title).toBe('Ajouté')
    // ...untranslated version falls back to the English entry.
    expect(out[1]).toBe(base[1])
  })

  it('ignores localized versions absent from the base (English owns the list)', () => {
    const localized = [
      { version: '0.0.1', date: '2020-01-01', sections: [{ title: 'X', items: ['stray'] }] },
    ]
    const out = selectLocaleChangelog(base, localized)
    expect(out).toEqual(base)
  })
})
