// Sentinel id for the consensus bot's ghost rows - never collides with real
// user ids and lets the client recognize the bot without a server import.
export const BOT_USER_ID = '__bot__'

export type ConsensusMethod = 'MODE' | 'MEAN'

// The synthetic bots, each a picking strategy scored by the real engine; none
// is stored - all are computed on the fly.
//  - CONSENSUS: the crowd's own MODE/MEAN scoreline.
//  - EVIL_TWIN: per-user - the signed-in player's own picks with every score
//    swapped (a draw is its own twin). Keeps their jokers and champion.
//  - EQUALIZER: always a draw ("the equalizer" = the goal that levels a game).
export type BotPersona = 'CONSENSUS' | 'EVIL_TWIN' | 'EQUALIZER'

export const BOT_PERSONAS: readonly BotPersona[] = ['CONSENSUS', 'EVIL_TWIN', 'EQUALIZER']

// Distinct ghost-row id per persona so all three can share one board without
// colliding on the render key. CONSENSUS keeps the original id so existing
// deep links and stored references still resolve.
const PERSONA_USER_IDS: Record<BotPersona, string> = {
  CONSENSUS: BOT_USER_ID,
  EVIL_TWIN: '__bot_evil_twin__',
  EQUALIZER: '__bot_equalizer__',
}

export function botUserId(persona: BotPersona): string {
  return PERSONA_USER_IDS[persona]
}

// Lowercase, hyphenated persona on the wire (query string / deep link).
export type BotPersonaParam = 'consensus' | 'evil-twin' | 'equalizer'

export const BOT_PERSONA_PARAMS: readonly BotPersonaParam[] = ['consensus', 'evil-twin', 'equalizer']

// The crowd-derived bots shown as leaderboard ghosts and on the /bot page. The
// evil twin is per-user and lives on profile pages, not here.
export const LEADERBOARD_BOT_PARAMS: readonly BotPersonaParam[] = ['consensus', 'equalizer']

const PARAM_TO_PERSONA: Record<BotPersonaParam, BotPersona> = {
  consensus: 'CONSENSUS',
  'evil-twin': 'EVIL_TWIN',
  equalizer: 'EQUALIZER',
}

const PERSONA_TO_PARAM: Record<BotPersona, BotPersonaParam> = {
  CONSENSUS: 'consensus',
  EVIL_TWIN: 'evil-twin',
  EQUALIZER: 'equalizer',
}

// Unknown/absent values fall back to the consensus bot (the original behaviour,
// so a bare /api/bot request still answers as it always did).
export function parseBotPersona(value: unknown): BotPersona {
  return typeof value === 'string' && value in PARAM_TO_PERSONA
    ? PARAM_TO_PERSONA[value as BotPersonaParam]
    : 'CONSENSUS'
}

export function botPersonaParam(persona: BotPersona): BotPersonaParam {
  return PERSONA_TO_PARAM[persona]
}

// The equalizer always calls a draw; 1-1 is the modal drawn scoreline.
export const DRAW_SCORELINE = { home: 1, away: 1 } as const

// Only the consensus bot has a MODE/MEAN choice; the evil twin swaps your own
// literal picks and the equalizer always draws, so neither shows the toggle.
// Takes the wire param, which is what the UI carries.
export function personaUsesMethod(persona: BotPersonaParam): boolean {
  return persona === 'consensus'
}

// Display metadata for each bot, shared by the leaderboard rows and the bot
// page. The i18n keys resolve in all five locales.
export interface BotPersonaMeta {
  icon: string
  nameKey: string
  blurbKey: string
}

export const BOT_PERSONA_META: Record<BotPersonaParam, BotPersonaMeta> = {
  consensus: { icon: '🤖', nameKey: 'bot.persona.consensus', blurbKey: 'bot.blurb.consensus' },
  'evil-twin': { icon: '😈', nameKey: 'bot.persona.evilTwin', blurbKey: 'bot.blurb.evilTwin' },
  equalizer: { icon: '⚖️', nameKey: 'bot.persona.equalizer', blurbKey: 'bot.blurb.equalizer' },
}
