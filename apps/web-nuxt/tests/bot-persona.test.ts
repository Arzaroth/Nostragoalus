import { describe, expect, it } from 'vitest'
import { BOT_PERSONA_META, BOT_PERSONA_PARAMS, botPersonaParamFromUserId, botUserId } from '#shared/types/bot'

describe('botPersonaParamFromUserId', () => {
  it('recovers each bot ghost row param from its synthetic user id', () => {
    expect(botPersonaParamFromUserId(botUserId('CONSENSUS'))).toBe('consensus')
    expect(botPersonaParamFromUserId(botUserId('EVIL_TWIN'))).toBe('evil-twin')
    expect(botPersonaParamFromUserId(botUserId('EQUALIZER'))).toBe('equalizer')
  })

  it('returns null for a real user id', () => {
    expect(botPersonaParamFromUserId('some-real-user')).toBeNull()
  })
})

describe('BOT_PERSONA_META villain avatars', () => {
  it('gives every persona a public villain image path', () => {
    for (const p of BOT_PERSONA_PARAMS) {
      expect(BOT_PERSONA_META[p].villain).toMatch(/^\/bots\/[a-z]+\.png$/)
    }
  })
})
