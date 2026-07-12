import { cabinetPath, chatMentionPath, type NotificationData } from '../../../shared/types/notifications'
import { DEFAULT_COMPETITION } from '../../../shared/competition'
import { dmPath } from '../../../shared/types/dm'
import type { CompetitionAwardType } from '../../../shared/types/achievements'
import en from '../../../i18n/locales/en.json'
import fr from '../../../i18n/locales/fr.json'
import th from '../../../i18n/locales/th.json'
import tlh from '../../../i18n/locales/tlh.json'
import ar from '../../../i18n/locales/ar.json'

// The push body is user-facing, so it follows the four-locale rule. The bell's
// client-side itemText can't run server-side, so push has its own terse `push.*`
// copy, resolved here to the recipient's locale.
export interface PushContent {
  title: string
  body: string
  url: string
  // Collapses repeat pushes about the same subject into one notification.
  tag: string
}

interface PushEntry {
  title: string
  body: string
}
type PushMessages = Record<string, PushEntry>

const MESSAGES: Record<string, PushMessages> = {
  en: (en as { push: PushMessages }).push,
  fr: (fr as { push: PushMessages }).push,
  th: (th as { push: PushMessages }).push,
  tlh: (tlh as { push: PushMessages }).push,
  ar: (ar as { push: PushMessages }).push,
}

function messagesFor(locale: string | null | undefined): PushMessages {
  return MESSAGES[locale ?? 'en'] ?? MESSAGES.en
}

// The push body needs the localized trophy/achievement NAME (the bell resolves it
// client-side; push has no i18n runtime, so it reads the same locale JSON here).
interface AchvNames {
  trophy: Record<string, { name: string }>
  badge: Record<string, { name: string }>
}
const ACHV: Record<string, AchvNames> = {
  en: (en as { achievements: AchvNames }).achievements,
  fr: (fr as { achievements: AchvNames }).achievements,
  th: (th as { achievements: AchvNames }).achievements,
  tlh: (tlh as { achievements: AchvNames }).achievements,
  ar: (ar as { achievements: AchvNames }).achievements,
}
function achvFor(locale: string | null | undefined): AchvNames {
  return ACHV[locale ?? 'en'] ?? ACHV.en
}
function trophyName(locale: string | null | undefined, type: CompetitionAwardType, teamName: string | null): string {
  const trophies = achvFor(locale).trophy
  if (type === 'TEAM_SPECIALIST') {
    return interp((teamName ? trophies.TEAM_SPECIALIST : trophies.TEAM_SPECIALIST_GENERIC)?.name ?? type, {
      team: teamName ?? '',
    })
  }
  return trophies[type]?.name ?? type
}
function achievementName(locale: string | null | undefined, key: string): string {
  return achvFor(locale).badge[key]?.name ?? key
}

function interp(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ''))
}

function render(entry: PushEntry, params: Record<string, string | number>): { title: string; body: string } {
  return { title: interp(entry.title, params), body: interp(entry.body, params) }
}

interface LiveMatchParams {
  matchId: string
  homeTeam: string
  awayTeam: string
}

// Push-only kickoff alert (a predicted match just went live).
export function kickoffPushContent(slug: string, p: LiveMatchParams, locale: string | null | undefined): PushContent {
  return {
    ...render(messagesFor(locale).kickoff, { home: p.homeTeam, away: p.awayTeam }),
    url: `/${slug}/matches/${p.matchId}`,
    tag: `match:${p.matchId}`,
  }
}

// Push-only goal alert. Live play has no scorer name (goal_event is only
// persisted at full-time), so the body is the new scoreline.
export function goalPushContent(
  slug: string,
  p: LiveMatchParams & { home: number | null; away: number | null },
  locale: string | null | undefined,
): PushContent {
  return {
    ...render(messagesFor(locale).goal, { home: p.homeTeam, away: p.awayTeam, hs: p.home ?? 0, as: p.away ?? 0 }),
    url: `/${slug}/matches/${p.matchId}`,
    tag: `match:${p.matchId}`,
  }
}

// Build the push title/body/url/tag for a stored notification, in the user's
// locale. GOAL/MATCH_LIVE are push-only and built by their own triggers.
export function notificationPushContent(data: NotificationData, locale: string | null | undefined): PushContent {
  const m = messagesFor(locale)
  switch (data.type) {
    case 'PICK_REMINDER':
      return {
        ...render(m.reminder, { home: data.homeTeam, away: data.awayTeam }),
        url: `/${data.competitionSlug}/matches/${data.matchId}`,
        tag: `match:${data.matchId}`,
      }
    case 'MATCH_RESULT':
      return {
        ...render(data.points > 0 ? m.matchResult : m.matchResultMiss, {
          home: data.homeTeam,
          away: data.awayTeam,
          hs: data.homeScore,
          as: data.awayScore,
          points: data.points,
        }),
        url: `/${data.competitionSlug}/matches/${data.matchId}`,
        tag: `match:${data.matchId}`,
      }
    case 'CHAMPION_RESULT':
      return {
        ...render(m.champion, { team: data.teamName, points: data.points }),
        url: `/${data.competitionSlug}/leaderboard`,
        tag: `comp:${data.competitionSlug}`,
      }
    case 'BEST_SCORER_RESULT':
      return {
        ...render(m.bestScorer, { player: data.playerName, points: data.points }),
        url: `/${data.competitionSlug}/leaderboard`,
        tag: `comp:${data.competitionSlug}`,
      }
    case 'TROPHY_AWARDED':
      return {
        ...render(m.trophy, {
          trophy: trophyName(locale, data.trophyType, data.teamName),
          competition: data.competitionName,
        }),
        url: cabinetPath(data),
        tag: `trophy:${data.competitionSlug}:${data.trophyType}`,
      }
    case 'ACHIEVEMENT_UNLOCKED':
      return {
        ...render(m.achievement, { achievement: achievementName(locale, data.key) }),
        url: cabinetPath(data),
        tag: `achv:${data.key}`,
      }
    case 'LEAGUE_JOIN':
      return {
        ...render(m.leagueJoin, { name: data.joinerName, league: data.leagueName }),
        url: `/leagues/${data.leagueId}`,
        tag: `league:${data.leagueId}`,
      }
    case 'LEAGUE_ROLE':
      return {
        ...render(data.role === 'OWNER' ? m.leagueRoleOwner : m.leagueRolePromoted, { league: data.leagueName }),
        url: `/leagues/${data.leagueId}`,
        tag: `league:${data.leagueId}`,
      }
    case 'LEAGUE_REMOVED':
      return {
        ...render(m.leagueRemoved, { league: data.leagueName }),
        url: '/leagues',
        tag: `league:${data.leagueId}`,
      }
    case 'CHAT_MENTION':
      // Room context only, never message text (chat is E2EE). The tag collapses
      // repeat mentions in the same room into one notification.
      return {
        ...(data.matchId
          ? render(m.mentionMatch, { name: data.senderName, home: data.homeTeam ?? '', away: data.awayTeam ?? '' })
          : render(m.mention, { name: data.senderName, league: data.leagueName })),
        url: chatMentionPath(data),
        tag: `mention:${data.leagueId}:${data.matchId ?? 'global'}`,
      }
    case 'DM_MESSAGE':
      // Sender name only, never message text (DMs are E2EE). The tag collapses a
      // burst of messages in the same thread into one notification.
      return {
        ...render(m.dm, { name: data.senderName }),
        url: dmPath(data.threadId),
        tag: `dm:${data.threadId}`,
      }
    case 'VOICE_MISSED':
      // Caller + room context only, never any media. A DM-scoped miss deep-links
      // to the thread; a league-scoped miss to that room. The tag collapses
      // repeated missed rings from the same caller/room into one notification.
      return {
        ...render(m.voiceMissed, { name: data.callerName }),
        url: data.threadId
          ? dmPath(data.threadId)
          : chatMentionPath({
              competitionSlug: data.competitionSlug ?? DEFAULT_COMPETITION,
              leagueId: data.leagueId ?? '',
              matchId: data.matchId,
            }),
        tag: data.threadId
          ? `call:dm:${data.threadId}`
          : `call:league:${data.leagueId}:${data.matchId ?? 'global'}`,
      }
  }
}
