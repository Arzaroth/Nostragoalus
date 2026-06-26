import { describe, it, expect } from 'vitest'
import { buildFeedCalendar, type FeedMatch } from './ical'

const NOW = new Date('2026-06-26T12:00:00Z')

function base(over: Partial<FeedMatch> = {}): FeedMatch {
  return {
    id: 'm1',
    competitionSlug: 'world-cup-2026',
    competitionName: 'FIFA World Cup 2026',
    homeTeam: 'France',
    awayTeam: 'Brazil',
    kickoffTime: new Date('2026-06-28T18:00:00Z'),
    status: 'SCHEDULED',
    fullTimeHome: null,
    fullTimeAway: null,
    penaltiesHome: null,
    penaltiesAway: null,
    roundLabel: 'Round of 16',
    predicted: false,
    ...over,
  }
}

function build(matches: FeedMatch[], locale: 'en' | 'fr' = 'en'): string {
  return buildFeedCalendar(matches, { origin: 'https://goal.example', locale, now: NOW })
}

// Reverse RFC 5545 line folding so content assertions read the logical line,
// not the wrapped physical ones.
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, '')
}

describe('buildFeedCalendar', () => {
  it('wraps events in a VCALENDAR with CRLF line endings', () => {
    const ics = build([base()])
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(unfold(ics)).toContain('PRODID:-//Nostragoalus//Calendar Feed//EN')
    expect(unfold(ics)).toContain('X-WR-CALNAME:Nostragoalus fixtures')
  })

  it('emits an upcoming fixture with UTC times, a deep link and a pick reminder', () => {
    const out = unfold(build([base()]))
    expect(out).toContain('UID:m1@nostragoalus')
    expect(out).toContain('DTSTART:20260628T180000Z')
    expect(out).toContain('DTEND:20260628T200000Z')
    expect(out).toContain('SUMMARY:France - Brazil')
    expect(out).toContain('URL:https://goal.example/world-cup-2026/matches/m1')
    expect(out).toContain('DESCRIPTION:FIFA World Cup 2026 · Round of 16\\n⚠ No prediction yet - locks at kickoff')
    expect(out).toContain('BEGIN:VALARM')
    expect(out).toContain('TRIGGER:-PT3H')
  })

  it('marks a predicted upcoming fixture and omits the alarm', () => {
    const out = unfold(build([base({ predicted: true })]))
    expect(out).toContain('✓ Prediction locked in')
    expect(out).not.toContain('BEGIN:VALARM')
  })

  it('renders a finished fixture with its scoreline and penalties, no alarm or pick line', () => {
    const out = unfold(
      build([
        base({
          status: 'FINISHED',
          kickoffTime: new Date('2026-06-20T18:00:00Z'),
          fullTimeHome: 1,
          fullTimeAway: 1,
          penaltiesHome: 4,
          penaltiesAway: 3,
        }),
      ]),
    )
    expect(out).toContain('SUMMARY:France 1-1 Brazil (4-3 pens)')
    expect(out).not.toContain('BEGIN:VALARM')
    expect(out).not.toContain('locks at kickoff')
  })

  it('does not alarm a fixture whose kickoff is already in the past even if SCHEDULED', () => {
    const out = unfold(build([base({ kickoffTime: new Date('2026-06-25T18:00:00Z') })]))
    expect(out).not.toContain('BEGIN:VALARM')
  })

  it('escapes TEXT special characters in team and round names', () => {
    const out = unfold(build([base({ homeTeam: 'A, B', awayTeam: 'C; D', roundLabel: 'Group\\X' })]))
    expect(out).toContain('SUMMARY:A\\, B - C\\; D')
    expect(out).toContain('Group\\\\X')
  })

  it('folds a content line longer than 75 octets onto continuation lines', () => {
    const longName = 'Confederation Championship Qualifying Play-off Final Stage Group'
    const ics = build([base({ competitionName: longName })])
    // A folded line is broken by CRLF + a single leading space.
    expect(ics).toMatch(/\r\n /)
    // Every physical line stays within the 75-octet content-line limit.
    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    }
  })

  it('localizes the event text to the token locale', () => {
    const out = unfold(build([base()], 'fr'))
    expect(out).toContain('Pas encore de pronostic')
    expect(out).toContain('X-WR-CALNAME:Matchs Nostragoalus')
  })

  it('produces only the calendar shell when there are no matches', () => {
    const ics = build([])
    expect(ics).not.toContain('BEGIN:VEVENT')
    expect(ics).toContain('BEGIN:VCALENDAR')
  })
})
