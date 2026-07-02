import { describe, it, expect } from 'vitest'
import {
  BOT_PERSONAS,
  BOT_USER_ID,
  DRAW_SCORELINE,
  botPersonaParam,
  botUserId,
  parseBotPersona,
  personaUsesMethod,
} from './bot'

describe('bot personas', () => {
  it('lists the three personas', () => {
    expect(BOT_PERSONAS).toEqual(['CONSENSUS', 'EVIL_TWIN', 'EQUALIZER'])
  })

  it('gives each persona a distinct ghost id, consensus keeping the legacy id', () => {
    expect(botUserId('CONSENSUS')).toBe(BOT_USER_ID)
    const ids = BOT_PERSONAS.map(botUserId)
    expect(new Set(ids).size).toBe(3)
  })

  it('round-trips persona <-> wire param', () => {
    for (const p of BOT_PERSONAS) {
      expect(parseBotPersona(botPersonaParam(p))).toBe(p)
    }
    expect(botPersonaParam('EVIL_TWIN')).toBe('evil-twin')
    expect(botPersonaParam('EQUALIZER')).toBe('equalizer')
  })

  it('falls back to CONSENSUS for unknown, empty or non-string values', () => {
    expect(parseBotPersona(undefined)).toBe('CONSENSUS')
    expect(parseBotPersona('')).toBe('CONSENSUS')
    expect(parseBotPersona('nope')).toBe('CONSENSUS')
    expect(parseBotPersona(42)).toBe('CONSENSUS')
    expect(parseBotPersona(['evil-twin'])).toBe('CONSENSUS')
  })

  it('only the equalizer ignores the consensus method', () => {
    expect(personaUsesMethod('CONSENSUS')).toBe(true)
    expect(personaUsesMethod('EVIL_TWIN')).toBe(true)
    expect(personaUsesMethod('EQUALIZER')).toBe(false)
  })

  it('the equalizer draw is 1-1', () => {
    expect(DRAW_SCORELINE).toEqual({ home: 1, away: 1 })
  })
})
