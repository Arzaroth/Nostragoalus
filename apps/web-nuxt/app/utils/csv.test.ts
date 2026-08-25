import { describe, expect, it } from 'vitest'
import type { RewardWinnerExportRow } from '#shared/types/rewards'
import { csvFileName, toCsv, winnersCsv, withBom } from './csv'

describe('toCsv', () => {
  it('joins rows with CRLF and leaves plain cells bare', () => {
    expect(toCsv([['criterion', 'prize'], ['OVERALL', 'A magnum']])).toBe('criterion,prize\r\nOVERALL,A magnum')
  })

  it('quotes cells holding a comma, a quote or a newline, doubling the quotes', () => {
    expect(toCsv([['a,b']])).toBe('"a,b"')
    expect(toCsv([['say "hi"']])).toBe('"say ""hi"""')
    expect(toCsv([['two\nlines']])).toBe('"two\nlines"')
    expect(toCsv([['carriage\rreturn']])).toBe('"carriage\rreturn"')
  })

  it('neutralizes a formula cell so a spreadsheet cannot execute a player name', () => {
    expect(toCsv([['=HYPERLINK("http://evil","x")']])).toBe('"\'=HYPERLINK(""http://evil"",""x"")"')
    expect(toCsv([['+1'], ['-1'], ['@who']])).toBe("'+1\r\n'-1\r\n'@who")
  })

  it('leaves numbers alone - a number cannot be a formula, and prefixing breaks totals', () => {
    expect(toCsv([['points', 12]])).toBe('points,12')
    expect(toCsv([[-3]])).toBe('-3')
    expect(toCsv([[0]])).toBe('0')
  })

  it('keeps an empty cell empty', () => {
    expect(toCsv([['', 'b']])).toBe(',b')
  })
})

function row(over: Partial<RewardWinnerExportRow> = {}): RewardWinnerExportRow {
  return {
    type: 'OVERALL',
    prizeLabel: 'A magnum',
    teamCode: null,
    metric: 'points',
    userId: 'u1',
    displayName: 'Alice',
    email: 'alice@example.com',
    value: 12,
    ...over,
  }
}

describe('winnersCsv', () => {
  it('writes the header then one line per holder', () => {
    expect(winnersCsv([row()])).toBe(
      'criterion,prize,team,player,player_id,email,metric,value\r\nOVERALL,A magnum,,Alice,u1,alice@example.com,points,12',
    )
  })

  it('names the featured team a TEAM_SPECIALIST prize was earned on', () => {
    const csv = winnersCsv([row({ type: 'TEAM_SPECIALIST', prizeLabel: 'A scarf', teamCode: 'FRA', metric: 'exact', value: 3 })])
    expect(csv.split('\r\n')[1]).toBe('TEAM_SPECIALIST,A scarf,FRA,Alice,u1,alice@example.com,exact,3')
  })

  it('keeps a concealed holder identifiable as a real row, not a broken one', () => {
    const csv = winnersCsv([row({ displayName: '', email: '' })])
    expect(csv.split('\r\n')[1]).toBe('OVERALL,A magnum,,,u1,,points,12')
  })

  it('escapes a prize label carrying a comma', () => {
    expect(winnersCsv([row({ prizeLabel: 'Wine, cheese' })]).split('\r\n')[1]).toContain('"Wine, cheese"')
  })
})

describe('withBom', () => {
  it('prefixes the byte-order mark Excel needs to read UTF-8', () => {
    expect(withBom('a,b')).toBe('\uFEFFa,b')
  })
})

describe('csvFileName', () => {
  it('slugs the league name into the file name', () => {
    expect(csvFileName('prizes', 'Les Cop@ins', new Date(2026, 7, 24))).toBe('prizes-les-cop-ins-2026-08-24.csv')
  })

  it('folds diacritics rather than dropping them', () => {
    expect(csvFileName('prizes', 'Équipe Café', new Date(2026, 7, 24))).toBe('prizes-equipe-cafe-2026-08-24.csv')
  })

  it('stamps the local date, not UTC - two exports on one working day share a name', () => {
    // 23:30 local on the 24th is already the 25th in UTC.
    expect(csvFileName('prizes', 'Ligue', new Date(2026, 7, 24, 23, 30))).toBe('prizes-ligue-2026-08-24.csv')
  })

  it('falls back when the name has nothing sluggable (Arabic, Thai)', () => {
    expect(csvFileName('prizes', 'دوري', new Date(2026, 7, 24))).toBe('prizes-league-2026-08-24.csv')
  })
})
