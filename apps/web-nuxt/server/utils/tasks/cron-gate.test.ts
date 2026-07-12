import { describe, it, expect } from 'vitest'
import { cronDisabled } from './cron-gate'

describe('cronDisabled', () => {
  it('allows cron runs when the switch is on (string or destr-coerced boolean)', () => {
    expect(cronDisabled('true')).toBe(false)
    expect(cronDisabled(true)).toBe(false)
  })

  it('blocks cron runs when the switch is off', () => {
    expect(cronDisabled('false')).toBe(true)
    expect(cronDisabled(undefined)).toBe(true)
    expect(cronDisabled('')).toBe(true)
  })

  it('lets a manual force trigger through regardless of the switch', () => {
    expect(cronDisabled('false', { force: true })).toBe(false)
    expect(cronDisabled(undefined, { force: true })).toBe(false)
  })

  it('does not treat truthy non-boolean force values as force', () => {
    expect(cronDisabled('false', { force: 'yes' })).toBe(true)
    expect(cronDisabled('false', {})).toBe(true)
  })
})
