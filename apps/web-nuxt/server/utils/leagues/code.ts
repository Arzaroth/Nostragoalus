import { randomInt } from 'node:crypto'

// No I/L/O/U/0/1: codes get read aloud and typed from screenshots.
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

export const JOIN_CODE_LENGTH = 8

export type JoinCodeGenerator = () => string

export function generateJoinCode(length = JOIN_CODE_LENGTH): string {
  let code = ''
  for (let i = 0; i < length; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)]
  return code
}

// Forgiving input: people paste codes with spaces/dashes and in lowercase.
// Anything else is left as-is so an invalid code fails the lookup naturally.
export function normalizeJoinCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, '')
}
