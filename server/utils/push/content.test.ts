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

  it('builds the mention copy and cross-league deep link (global and match rooms)', () => {
    const base = {
      type: 'CHAT_MENTION',
      leagueId: 'l1',
      leagueName: 'Friends',
      competitionSlug: 'wc',
      senderId: 'u1',
      senderName: 'Alice',
    } as const
    const global = notificationPushContent({ ...base, matchId: null, homeTeam: null, awayTeam: null }, 'en')
    expect(global.body).toContain('Alice')
    expect(global.body).toContain('Friends')
    expect(global).toMatchObject({ url: '/wc?ngLeague=l1&chat=global', tag: 'mention:l1:global' })

    const match = notificationPushContent({ ...base, matchId: 'm9', homeTeam: 'France', awayTeam: 'Brazil' }, 'en')
    expect(match.body).toContain('France')
    expect(match).toMatchObject({ url: '/wc/matches/m9?ngLeague=l1&chat=m9', tag: 'mention:l1:m9' })

    // A match room with no resolved teams still renders (empty team slots).
    const blank = notificationPushContent({ ...base, matchId: 'm9', homeTeam: null, awayTeam: null }, 'en')
    expect(blank.body).toContain('Alice')
    expect(blank.url).toBe('/wc/matches/m9?ngLeague=l1&chat=m9')
  })

  it('renders trophy and achievement pushes with the cabinet deep link', () => {
    const overall = notificationPushContent(
      { type: 'TROPHY_AWARDED', competitionSlug: 'wc', competitionName: 'World Cup', userId: 'u1', trophyType: 'OVERALL', teamName: null },
      'en',
    )
    expect(overall.body).toContain('Grand Champion')
    expect(overall.body).toContain('World Cup')
    expect(overall).toMatchObject({ url: '/wc/users/u1', tag: 'trophy:wc:OVERALL' })

    // Team specialist interpolates the team; a null team uses the generic name.
    const spec = notificationPushContent(
      { type: 'TROPHY_AWARDED', competitionSlug: 'wc', competitionName: 'World Cup', userId: 'u1', trophyType: 'TEAM_SPECIALIST', teamName: 'France' },
      'en',
    )
    expect(spec.body).toContain('France')
    expect(
      notificationPushContent(
        { type: 'TROPHY_AWARDED', competitionSlug: 'wc', competitionName: 'World Cup', userId: 'u1', trophyType: 'TEAM_SPECIALIST', teamName: null },
        'en',
      ).body,
    ).toContain('Team Specialist')

    const badge = notificationPushContent(
      { type: 'ACHIEVEMENT_UNLOCKED', competitionSlug: 'wc', competitionName: 'World Cup', userId: 'u1', key: 'first-blood', tier: 'BRONZE' },
      'en',
    )
    expect(badge.body).toContain('First Blood')
    expect(badge).toMatchObject({ url: '/wc/users/u1', tag: 'achv:first-blood' })

    // A global badge (no competition) links home.
    expect(
      notificationPushContent(
        { type: 'ACHIEVEMENT_UNLOCKED', competitionSlug: null, competitionName: null, userId: 'u1', key: 'the-magic-word', tier: 'GOLD' },
        'en',
      ).url,
    ).toBe('/')
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
