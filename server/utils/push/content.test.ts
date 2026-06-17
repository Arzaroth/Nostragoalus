import { describe, it, expect } from 'vitest'
import { goalPushContent, kickoffPushContent, notificationPushContent } from './content'
import type { NotificationData } from '../../../shared/types/notifications'

const reminder: NotificationData = {
  type: 'PICK_REMINDER',
  matchId: 'm1',
  competitionSlug: 'wc',
  homeTeam: 'Spain',
  awayTeam: 'Brazil',
  kickoffTime: '2026-06-15T20:00:00.000Z',
}

describe('notificationPushContent', () => {
  it('builds a localized body, url and tag for a reminder', () => {
    const en = notificationPushContent(reminder, 'en')
    expect(en.body).toBe('Spain v Brazil kicks off soon')
    expect(en.url).toBe('/wc/matches/m1')
    expect(en.tag).toBe('match:m1')
    expect(notificationPushContent(reminder, 'fr').body).toContain('commence')
  })

  it('uses the miss copy when no points were scored', () => {
    const win: NotificationData = {
      type: 'MATCH_RESULT',
      matchId: 'm1',
      competitionSlug: 'wc',
      homeTeam: 'A',
      awayTeam: 'B',
      homeScore: 2,
      awayScore: 1,
      points: 5,
    }
    expect(notificationPushContent(win, 'en').body).toContain('+5')
    expect(notificationPushContent({ ...win, points: 0 }, 'en').body).toContain('no points')
  })

  it('distinguishes owner from moderator', () => {
    const owner: NotificationData = { type: 'LEAGUE_ROLE', leagueId: 'l1', leagueName: 'F', role: 'OWNER' }
    expect(notificationPushContent(owner, 'en').body).toContain('owner')
    expect(notificationPushContent({ ...owner, role: 'MODERATOR' }, 'en').body).toContain('moderator')
  })

  it('renders the result and league types with their deep links', () => {
    expect(
      notificationPushContent(
        { type: 'CHAMPION_RESULT', competitionSlug: 'wc', competitionName: 'WC', teamName: 'Brazil', points: 40, won: true },
        'en',
      ),
    ).toMatchObject({ url: '/wc/leaderboard', tag: 'comp:wc' })
    expect(
      notificationPushContent(
        { type: 'BEST_SCORER_RESULT', competitionSlug: 'wc', competitionName: 'WC', playerName: 'X', points: 10, won: true },
        'en',
      ).url,
    ).toBe('/wc/leaderboard')
    expect(
      notificationPushContent({ type: 'LEAGUE_JOIN', leagueId: 'l1', leagueName: 'F', joinerName: 'Bob' }, 'en'),
    ).toMatchObject({ url: '/leagues/l1', tag: 'league:l1' })
    expect(notificationPushContent({ type: 'LEAGUE_REMOVED', leagueId: 'l1', leagueName: 'F' }, 'en').url).toBe('/leagues')
  })

  it('falls back to English for an unknown or null locale', () => {
    expect(notificationPushContent(reminder, 'xx').body).toBe(notificationPushContent(reminder, 'en').body)
    expect(notificationPushContent(reminder, null).body).toBe(notificationPushContent(reminder, 'en').body)
  })
})

describe('live-push builders', () => {
  const p = { matchId: 'm1', homeTeam: 'Spain', awayTeam: 'Brazil' }

  it('kickoff carries the match deep link and tag', () => {
    expect(kickoffPushContent('wc', p, 'en')).toMatchObject({ url: '/wc/matches/m1', tag: 'match:m1' })
  })

  it('goal renders the scoreline', () => {
    expect(goalPushContent('wc', { ...p, home: 2, away: 1 }, 'en').body).toContain('2')
  })

  it('treats a null live score as 0', () => {
    expect(goalPushContent('wc', { ...p, home: null, away: null }, 'en').body).toContain('0')
  })
})
