import { ConflictError, ForbiddenError, JokerQuotaError, LockedError, NotFoundError, ValidationError } from './errors'

export function toHttpError(error: unknown): unknown {
  if (error instanceof NotFoundError) return createError({ statusCode: 404, statusMessage: error.message })
  if (error instanceof LockedError) return createError({ statusCode: 409, statusMessage: error.message })
  if (error instanceof JokerQuotaError) return createError({ statusCode: 409, statusMessage: error.message })
  if (error instanceof ConflictError) return createError({ statusCode: 409, statusMessage: error.message })
  if (error instanceof ForbiddenError) return createError({ statusCode: 403, statusMessage: error.message })
  if (error instanceof ValidationError) return createError({ statusCode: 400, statusMessage: error.message })
  return error
}
