import { describe, expect, it } from 'vitest'
import { csvFileName, toCsv, withBom } from './csv'

describe('toCsv', () => {
  it('joins rows with CRLF and leaves plain cells bare', () => {
    expect(toCsv([['criterion', 'prize'], ['OVERALL', 'A magnum']])).toBe('criterion,prize\r\nOVERALL,A magnum')
  })

  it('quotes cells holding a comma, a quote or a newline, doubling the quotes', () => {
    expect(toCsv([['a,b']])).toBe('"a,b"')
    expect(toCsv([['say "hi"']])).toBe('"say ""hi"""')
    expect(toCsv([['two\nlines']])).toBe('"two\nlines"')
  })

  it('renders numbers unquoted', () => {
    expect(toCsv([['points', 12]])).toBe('points,12')
  })

  it('neutralizes a formula cell so a spreadsheet cannot execute a player name', () => {
    expect(toCsv([['=HYPERLINK("http://evil","x")']])).toBe('"\'=HYPERLINK(""http://evil"",""x"")"')
    expect(toCsv([['+1'], ['-1'], ['@who']])).toBe("'+1\r\n'-1\r\n'@who")
  })

  it('keeps an empty cell empty', () => {
    expect(toCsv([['', 'b']])).toBe(',b')
  })
})

describe('withBom', () => {
  it('prefixes the byte-order mark Excel needs to read UTF-8', () => {
    expect(withBom('a,b')).toBe('\uFEFFa,b')
  })
})

describe('csvFileName', () => {
  it('slugs the league name into the file name', () => {
    expect(csvFileName('prizes', 'Les Cop@ins', '2026-08-24')).toBe('prizes-les-cop-ins-2026-08-24.csv')
  })

  it('trims leading and trailing separators', () => {
    expect(csvFileName('prizes', '  Ligue 1! ', '2026-08-24')).toBe('prizes-ligue-1-2026-08-24.csv')
  })

  it('falls back when the name has nothing sluggable (Arabic, Thai)', () => {
    expect(csvFileName('prizes', 'دوري', '2026-08-24')).toBe('prizes-league-2026-08-24.csv')
  })
})
