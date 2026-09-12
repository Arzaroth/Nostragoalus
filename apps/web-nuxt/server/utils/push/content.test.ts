import { describe, it, expect } from 'vitest'
import { goalPushContent, kickoffPushContent, notificationPushContent } from './content'
import type { NotificationData } from '../../../shared/types/notifications'

// The app's resolved default competition; the builder takes it rather than
// importing a constant, since the real default is admin-set.
const FALLBACK = 'default-cup'

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
    const en = notificationPushContent(reminder, 'en', FALLBACK)
    expect(en.body).toBe('Spain v Brazil kicks off soon')
    expect(en.url).toBe('/wc/matches/m1')
    expect(en.tag).toBe('match:m1')
    expect(notificationPushContent(reminder, 'fr', FALLBACK).body).toContain('commence')
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
    expect(notificationPushContent(win, 'en', FALLBACK).body).toContain('+5')
    expect(notificationPushContent({ ...win, points: 0 }, 'en', FALLBACK).body).toContain('no points')
  })

  it('distinguishes owner from moderator', () => {
    const owner: NotificationData = { type: 'LEAGUE_ROLE', leagueId: 'l1', leagueName: 'F', role: 'OWNER' }
    expect(notificationPushContent(owner, 'en', FALLBACK).body).toContain('owner')
    expect(notificationPushContent({ ...owner, role: 'MODERATOR' }, 'en', FALLBACK).body).toContain('moderator')
  })

  it('renders the result and league types with their deep links', () => {
    expect(
      notificationPushContent(
        { type: 'CHAMPION_RESULT', competitionSlug: 'wc', competitionName: 'WC', teamName: 'Brazil', points: 40, won: true },
        'en',
        FALLBACK,
      ),
    ).toMatchObject({ url: '/wc/leaderboard', tag: 'comp:wc' })
    expect(
      notificationPushContent(
        { type: 'BEST_SCORER_RESULT', competitionSlug: 'wc', competitionName: 'WC', playerName: 'X', points: 10, won: true },
        'en',
        FALLBACK,
      ).url,
    ).toBe('/wc/leaderboard')
    expect(
      notificationPushContent({ type: 'LEAGUE_JOIN', leagueId: 'l1', leagueName: 'F', joinerName: 'Bob' }, 'en', FALLBACK),
    ).toMatchObject({ url: '/leagues/l1', tag: 'league:l1' })
    expect(notificationPushContent({ type: 'LEAGUE_REMOVED', leagueId: 'l1', leagueName: 'F' }, 'en', FALLBACK).url).toBe('/leagues')
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
    const global = notificationPushContent({ ...base, matchId: null, homeTeam: null, awayTeam: null }, 'en', FALLBACK)
    expect(global.body).toContain('Alice')
    expect(global.body).toContain('Friends')
    expect(global).toMatchObject({ url: '/wc?ngLeague=l1&chat=global', tag: 'mention:l1:global' })

    const match = notificationPushContent({ ...base, matchId: 'm9', homeTeam: 'France', awayTeam: 'Brazil' }, 'en', FALLBACK)
    expect(match.body).toContain('France')
    expect(match).toMatchObject({ url: '/wc/matches/m9?ngLeague=l1&chat=m9', tag: 'mention:l1:m9' })

    // A match room with no resolved teams still renders (empty team slots).
    const blank = notificationPushContent({ ...base, matchId: 'm9', homeTeam: null, awayTeam: null }, 'en', FALLBACK)
    expect(blank.body).toContain('Alice')
    expect(blank.url).toBe('/wc/matches/m9?ngLeague=l1&chat=m9')
  })

  it('builds missed-call copy + deep link for DM and league scopes', () => {
    const dm = notificationPushContent(
      {
        type: 'VOICE_MISSED',
        callerId: 'u1',
        callerName: 'Alice',
        threadId: 't7',
        leagueId: null,
        leagueName: null,
        competitionSlug: null,
        matchId: null,
      },
      'en',
      FALLBACK,
    )
    expect(dm.body).toContain('Alice')
    expect(dm).toMatchObject({ url: '/?dm=t7', tag: 'call:dm:t7' })

    const leagueMatch = notificationPushContent(
      {
        type: 'VOICE_MISSED',
        callerId: 'u1',
        callerName: 'Bob',
        threadId: null,
        leagueId: 'l1',
        leagueName: 'Friends',
        competitionSlug: 'wc',
        matchId: 'm9',
      },
      'en',
      FALLBACK,
    )
    expect(leagueMatch).toMatchObject({ url: '/wc/matches/m9?ngLeague=l1&chat=m9', tag: 'call:league:l1:m9' })

    const leagueGlobal = notificationPushContent(
      {
        type: 'VOICE_MISSED',
        callerId: 'u1',
        callerName: 'Bob',
        threadId: null,
        leagueId: 'l1',
        leagueName: 'Friends',
        competitionSlug: 'wc',
        matchId: null,
      },
      'en',
      FALLBACK,
    )
    expect(leagueGlobal.tag).toBe('call:league:l1:global')

    // Defensive: a league-scoped miss with the slug/league unresolved still renders
    // (the `?? default` fallbacks), never throwing on a null.
    const bare = notificationPushContent(
      {
        type: 'VOICE_MISSED',
        callerId: 'u1',
        callerName: 'Bob',
        threadId: null,
        leagueId: null,
        leagueName: null,
        competitionSlug: null,
        matchId: null,
      },
      'en',
      FALLBACK,
    )
    expect(bare.body).toContain('Bob')
  })

  it('renders trophy and achievement pushes with the cabinet deep link', () => {
    const overall = notificationPushContent(
      { type: 'TROPHY_AWARDED', competitionSlug: 'wc', competitionName: 'World Cup', userId: 'u1', trophyType: 'OVERALL', teamName: null },
      'en',
      FALLBACK,
    )
    expect(overall.body).toContain('Grand Champion')
    expect(overall.body).toContain('World Cup')
    expect(overall).toMatchObject({ url: '/wc/users/u1#cabinet', tag: 'trophy:wc:OVERALL' })

    // Team specialist interpolates the team; a null team uses the generic name.
    const spec = notificationPushContent(
      { type: 'TROPHY_AWARDED', competitionSlug: 'wc', competitionName: 'World Cup', userId: 'u1', trophyType: 'TEAM_SPECIALIST', teamName: 'France' },
      'en',
      FALLBACK,
    )
    expect(spec.body).toContain('France')
    expect(
      notificationPushContent(
        { type: 'TROPHY_AWARDED', competitionSlug: 'wc', competitionName: 'World Cup', userId: 'u1', trophyType: 'TEAM_SPECIALIST', teamName: null },
        'en',
        FALLBACK,
      ).body,
    ).toContain('Team Specialist')

    const badge = notificationPushContent(
      { type: 'ACHIEVEMENT_UNLOCKED', competitionSlug: 'wc', competitionName: 'World Cup', userId: 'u1', key: 'first-blood', tier: 'BRONZE' },
      'en',
      FALLBACK,
    )
    expect(badge.body).toContain('The Hunt Is On') // key first-blood, renamed
    expect(badge).toMatchObject({ url: '/wc/users/u1#cabinet', tag: 'achv:first-blood' })

    // A global badge (no competition) still lands on the owner's cabinet, under
    // whichever competition the app resolved as default (it shows global items
    // too), not the home page and not a competition baked in at build time.
    expect(
      notificationPushContent(
        { type: 'ACHIEVEMENT_UNLOCKED', competitionSlug: null, competitionName: null, userId: 'u1', key: 'the-magic-word', tier: 'GOLD' },
        'en',
        FALLBACK,
      ).url,
    ).toBe(`/${FALLBACK}/users/u1#cabinet`)
  })

  it('falls back to the raw type/key when a trophy or badge name is missing', () => {
    // Unknown badge key: no localized name, so the key itself is shown.
    expect(
      notificationPushContent(
        { type: 'ACHIEVEMENT_UNLOCKED', competitionSlug: 'wc', competitionName: 'WC', userId: 'u1', key: 'no-such-badge', tier: 'BRONZE' },
        'en',
        FALLBACK,
      ).body,
    ).toContain('no-such-badge')
    // Unknown trophy type falls back to the raw type; an unknown locale falls back to English.
    expect(
      notificationPushContent(
        { type: 'TROPHY_AWARDED', competitionSlug: 'wc', competitionName: 'WC', userId: 'u1', trophyType: 'MYSTERY' as never, teamName: null },
        'xx',
        FALLBACK,
      ).body,
    ).toContain('MYSTERY')
  })

  it('falls back to English for an unknown or null locale', () => {
    expect(notificationPushContent(reminder, 'xx', FALLBACK).body).toBe(notificationPushContent(reminder, 'en', FALLBACK).body)
    expect(notificationPushContent(reminder, null, FALLBACK).body).toBe(notificationPushContent(reminder, 'en', FALLBACK).body)
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
