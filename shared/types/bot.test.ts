import { describe, it, expect } from 'vitest'
import {
  BOT_PERSONAS,
  BOT_PERSONA_META,
  BOT_PERSONA_PARAMS,
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

  it('wire-param list lines up with the persona list', () => {
    expect(BOT_PERSONA_PARAMS).toEqual(BOT_PERSONAS.map(botPersonaParam))
  })

  it('falls back to CONSENSUS for unknown, empty or non-string values', () => {
    expect(parseBotPersona(undefined)).toBe('CONSENSUS')
    expect(parseBotPersona('')).toBe('CONSENSUS')
    expect(parseBotPersona('nope')).toBe('CONSENSUS')
    expect(parseBotPersona(42)).toBe('CONSENSUS')
    expect(parseBotPersona(['evil-twin'])).toBe('CONSENSUS')
  })

  it('only the equalizer ignores the consensus method', () => {
    expect(personaUsesMethod('consensus')).toBe(true)
    expect(personaUsesMethod('evil-twin')).toBe(true)
    expect(personaUsesMethod('equalizer')).toBe(false)
  })

  it('the equalizer draw is 1-1', () => {
    expect(DRAW_SCORELINE).toEqual({ home: 1, away: 1 })
  })

  it('has display metadata for every persona', () => {
    expect(Object.keys(BOT_PERSONA_META)).toEqual([...BOT_PERSONA_PARAMS])
    for (const p of BOT_PERSONA_PARAMS) {
      expect(BOT_PERSONA_META[p].icon).toBeTruthy()
      expect(BOT_PERSONA_META[p].nameKey).toMatch(/^bot\.persona\./)
      expect(BOT_PERSONA_META[p].blurbKey).toMatch(/^bot\.blurb\./)
    }
  })
})
