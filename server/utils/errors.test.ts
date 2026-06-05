import { describe, it, expect } from 'vitest'
import { JokerQuotaError, LockedError, NotFoundError, ValidationError } from './errors'

describe('errors', () => {
  it('expose names and default + custom messages', () => {
    expect(new NotFoundError().name).toBe('NotFoundError')
    expect(new LockedError().name).toBe('LockedError')
    expect(new JokerQuotaError().name).toBe('JokerQuotaError')
    expect(new ValidationError().name).toBe('ValidationError')

    expect(new NotFoundError('nope').message).toBe('nope')
    expect(new LockedError().message).toBe('match is locked')
    expect(new JokerQuotaError().message).toContain('joker')
    expect(new ValidationError().message).toBe('invalid input')
  })
})
