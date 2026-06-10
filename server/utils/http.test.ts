import { describe, it, expect, vi, beforeAll } from 'vitest'
import { toHttpError } from './http'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors'

beforeAll(() => {
  vi.stubGlobal('createError', (e: { statusCode: number; statusMessage: string }) => e)
})

describe('toHttpError', () => {
  it('maps domain errors to status codes', () => {
    expect((toHttpError(new NotFoundError('x')) as { statusCode: number }).statusCode).toBe(404)
    expect((toHttpError(new ConflictError('x')) as { statusCode: number }).statusCode).toBe(409)
    expect((toHttpError(new ForbiddenError('x')) as { statusCode: number }).statusCode).toBe(403)
    expect((toHttpError(new ValidationError('x')) as { statusCode: number }).statusCode).toBe(400)
  })

  it('maps a raw unique violation (direct or nested cause) to 409', () => {
    expect((toHttpError({ code: '23505' }) as { statusCode: number }).statusCode).toBe(409)
    expect((toHttpError({ cause: { code: '23505' } }) as { statusCode: number }).statusCode).toBe(409)
  })

  it('passes unknown errors through untouched', () => {
    const err = new Error('boom')
    expect(toHttpError(err)).toBe(err)
    expect(toHttpError({ code: '12345' })).toEqual({ code: '12345' })
  })
})
