import { describe, it, expect } from 'vitest'
import { flagUrl, playerPhotoUrl, squarePlayerPhoto, formatPlayerName, isLocked, searchable, matchStatusLabel, pensResult, statusSeverity, tierLabel, roundLabel } from './format'
import type { MatchStatus } from '../../shared/types/match'

const STATUSES: MatchStatus[] = [
  'SCHEDULED',
  'LIVE',
  'PAUSED',
  'FINISHED',
  'POSTPONED',
  'CANCELLED',
  'SUSPENDED',
  'AWARDED',
]

// Stub translator: echoes the key so we assert the mapping, not the copy.
const tr = (key: string) => key

describe('matchStatusLabel & statusSeverity', () => {
  it('returns a label key and a severity for every status', () => {
    for (const status of STATUSES) {
      expect(matchStatusLabel(status, tr)).toBeTruthy()
      expect(['success', 'info', 'warn', 'danger', 'secondary']).toContain(statusSeverity(status))
    }
  })

  it('maps representative statuses', () => {
    expect(matchStatusLabel('FINISHED', tr)).toBe('match.statusLabel.fullTime')
    expect(statusSeverity('LIVE')).toBe('danger')
    expect(statusSeverity('SCHEDULED')).toBe('info')
    expect(statusSeverity('CANCELLED')).toBe('secondary')
    expect(statusSeverity('POSTPONED')).toBe('warn')
  })
})

describe('tierLabel', () => {
  it('labels each tier and handles null', () => {
    expect(tierLabel('EXACT', tr)).toBe('predictions.tier.exact')
    expect(tierLabel('DIFF', tr)).toBe('predictions.tier.diff')
    expect(tierLabel('OUTCOME', tr)).toBe('predictions.tier.outcome')
    expect(tierLabel('MISS', tr)).toBe('predictions.tier.miss')
    expect(tierLabel(null, tr)).toBe('')
    expect(tierLabel(undefined, tr)).toBe('')
  })
})

describe('roundLabel', () => {
  it('maps known bracket round names (semi before final) and falls back to the raw name', () => {
    expect(roundLabel('Round of 32', tr)).toBe('bracket.round.r32')
    expect(roundLabel('Round of 16', tr)).toBe('bracket.round.r16')
    expect(roundLabel('Quarter-finals', tr)).toBe('bracket.round.qf')
    expect(roundLabel('Semi-finals', tr)).toBe('bracket.round.sf')
    expect(roundLabel('Play-off for third place', tr)).toBe('bracket.round.third')
    expect(roundLabel('Final', tr)).toBe('bracket.round.final')
    expect(roundLabel('Group A', tr)).toBe('Group A')
    expect(roundLabel(null, tr)).toBe('')
  })
})

describe('isLocked', () => {
  it('is true once kickoff has passed', () => {
    const kickoff = '2026-06-11T16:00:00Z'
    expect(isLocked(kickoff, new Date('2026-06-11T16:00:01Z').getTime())).toBe(true)
    expect(isLocked(kickoff, new Date('2026-06-11T15:59:59Z').getTime())).toBe(false)
  })
})

describe('flagUrl', () => {
  it('builds a FIFA flag url or returns null', () => {
    expect(flagUrl('MEX')).toContain('/flags-sq-3/MEX')
    expect(flagUrl(null)).toBeNull()
    expect(flagUrl(undefined)).toBeNull()
  })
})

describe('playerPhotoUrl', () => {
  it('builds a FIFA headshot url or returns null', () => {
    expect(playerPhotoUrl('400089481')).toContain('/players-sq-3/400089481')
    expect(playerPhotoUrl('400089481', { provider: 'fifa' })).toContain('api.fifa.com')
    expect(playerPhotoUrl('250016833', { provider: 'uefa', season: '2024' })).toBe(
      'https://img.uefa.com/imgml/TP/players/3/2024/324x324/250016833.jpg',
    )
    // UEFA without a season falls back to a default year.
    expect(playerPhotoUrl('250016833', { provider: 'uefa' })).toContain('img.uefa.com/imgml/TP/players/3/2024/')
    expect(playerPhotoUrl(null)).toBeNull()
    expect(playerPhotoUrl(undefined)).toBeNull()
  })

  it('squarePlayerPhoto adds a transform query for digitalhub urls only', () => {
    expect(squarePlayerPhoto('https://digitalhub.fifa.com/transform/abc/DZEKO-Edin_300409')).toBe(
      'https://digitalhub.fifa.com/transform/abc/DZEKO-Edin_300409?io=transform:fill,aspectratio:1x1,width:320,gravity:top&quality=75',
    )
    expect(squarePlayerPhoto('https://digitalhub.fifa.com/transform/abc/x', 640)).toContain('width:640')
    expect(squarePlayerPhoto('https://example.com/p.jpg')).toBe('https://example.com/p.jpg')
    expect(squarePlayerPhoto(null)).toBeNull()
    expect(squarePlayerPhoto(undefined)).toBeNull()
  })
})

describe('pensResult', () => {
  it('formats real shootouts and hides artifacts', () => {
    expect(pensResult({ penaltiesHome: 4, penaltiesAway: 2 })).toBe('4–2')
    expect(pensResult({ penaltiesHome: 0, penaltiesAway: 0 })).toBeNull()
    expect(pensResult({ penaltiesHome: null, penaltiesAway: null })).toBeNull()
    expect(pensResult({})).toBeNull()
  })
})

describe('formatPlayerName', () => {
  it('title-cases fully-uppercased words only', () => {
    expect(formatPlayerName('Kylian MBAPPÉ')).toBe('Kylian Mbappé')
    expect(formatPlayerName('Brice SAMBA')).toBe('Brice Samba')
    expect(formatPlayerName('Warren ZAÏRE-EMERY')).toBe('Warren Zaïre-Emery')
    expect(formatPlayerName("N'GOLO KANTÉ")).toBe("N'Golo Kanté")
    expect(formatPlayerName('Didier DESCHAMPS')).toBe('Didier Deschamps')
  })
  it('leaves mixed-case names and edge inputs alone', () => {
    expect(formatPlayerName('Kylian Mbappé')).toBe('Kylian Mbappé')
    expect(formatPlayerName('van Dijk')).toBe('van Dijk')
    expect(formatPlayerName('McTominay')).toBe('McTominay')
    expect(formatPlayerName(null)).toBe('')
    expect(formatPlayerName('A')).toBe('A')
  })
})

describe('searchable', () => {
  it('strips accents and case so partial queries match', () => {
    expect(searchable('Türkiye')).toBe('turkiye')
    expect(searchable('Türkiye').includes(searchable('Tur'))).toBe(true)
    expect(searchable('Côte d’Ivoire').startsWith('cote')).toBe(true)
    expect(searchable('SVN FRA').includes('fra')).toBe(true)
    expect(searchable(null)).toBe('')
  })
})
