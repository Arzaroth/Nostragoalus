import type { MatchStatus } from '#shared/types/match'
import { shareTranslator } from '../share/i18n'
import type { FeedLocale } from './token'

// A self-contained RFC 5545 (iCalendar) writer for the per-user feed. Hand-rolled
// (no dep): one VEVENT per fixture, a VALARM reminder only on upcoming matches the
// user has not predicted. It never carries the user's predicted score - only the
// public scoreline once played and a "predicted / not predicted" flag - so the
// feed can be fetched by a session-less calendar client without leaking a pick.

export interface FeedMatch {
  id: string
  competitionSlug: string
  competitionName: string
  homeTeam: string
  awayTeam: string
  kickoffTime: Date | string
  status: MatchStatus
  fullTimeHome: number | null
  fullTimeAway: number | null
  penaltiesHome: number | null
  penaltiesAway: number | null
  roundLabel: string
  predicted: boolean
}

export interface BuildFeedOptions {
  origin: string
  locale: FeedLocale
  now: Date
}

const MATCH_DURATION_MS = 2 * 60 * 60 * 1000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// iCalendar UTC date-time: YYYYMMDDTHHMMSSZ.
function formatUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

// RFC 5545 3.3.11 TEXT escaping: backslash, semicolon, comma and newline.
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// RFC 5545 3.1 content-line folding at 75 octets, never splitting a multi-byte
// character. Continuation lines start with a single space (which costs 1 octet,
// so they carry at most 74 of their own).
function foldLine(line: string): string {
  let result = ''
  let segLen = 0
  let limit = 75
  for (const ch of line) {
    const chLen = Buffer.byteLength(ch, 'utf8')
    if (segLen + chLen > limit) {
      result += '\r\n '
      segLen = 0
      limit = 74
    }
    result += ch
    segLen += chLen
  }
  return result
}

function buildEvent(m: FeedMatch, opts: BuildFeedOptions, t: (k: string, p?: Record<string, string | number>) => string, stamp: string): string[] {
  const start = new Date(m.kickoffTime)
  const end = new Date(start.getTime() + MATCH_DURATION_MS)
  const finished = m.fullTimeHome != null && m.fullTimeAway != null
  const upcoming = m.status === 'SCHEDULED' && start.getTime() > opts.now.getTime()

  const pens =
    m.penaltiesHome != null && m.penaltiesAway != null
      ? ` (${m.penaltiesHome}-${m.penaltiesAway} ${t('feed.pens')})`
      : ''
  const summary = finished
    ? `${m.homeTeam} ${m.fullTimeHome}-${m.fullTimeAway} ${m.awayTeam}${pens}`
    : `${m.homeTeam} - ${m.awayTeam}`

  const descLines = [`${m.competitionName} · ${m.roundLabel}`]
  if (upcoming) descLines.push(m.predicted ? t('feed.predicted') : t('feed.notPredicted'))

  const ev = [
    'BEGIN:VEVENT',
    `UID:${m.id}@nostragoalus`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(descLines.join('\n'))}`,
    // URL is a URI value, not TEXT - it must not be TEXT-escaped. Match deep
    // links are /slug/matches/uuid, so they carry no characters needing folding
    // help beyond the generic fold pass.
    `URL:${opts.origin}/${m.competitionSlug}/matches/${m.id}`,
  ]
  // The only personalised nudge: remind the user to pick a match they have not,
  // 3h out (mirrors the in-app PICK_REMINDER lead). A predicted or already-locked
  // match gets no alarm.
  if (upcoming && !m.predicted) {
    ev.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(t('feed.alarm', { home: m.homeTeam, away: m.awayTeam }))}`,
      'TRIGGER:-PT3H',
      'END:VALARM',
    )
  }
  ev.push('END:VEVENT')
  return ev
}

export function buildFeedCalendar(matches: FeedMatch[], opts: BuildFeedOptions): string {
  const t = shareTranslator(opts.locale)
  const stamp = formatUtc(opts.now)
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nostragoalus//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(t('feed.calendarName'))}`,
    'X-WR-TIMEZONE:UTC',
  ]
  for (const m of matches) lines.push(...buildEvent(m, opts, t, stamp))
  lines.push('END:VCALENDAR')
  // CRLF line endings per spec; trailing CRLF closes the last line.
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
