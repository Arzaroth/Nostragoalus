import { ConflictError, ForbiddenError, JokerQuotaError, LockedError, NotFoundError, StorageError, ValidationError } from './errors'

export function toHttpError(error: unknown): unknown {
  if (error instanceof NotFoundError) return createError({ statusCode: 404, statusMessage: error.message })
  if (error instanceof LockedError) return createError({ statusCode: 409, statusMessage: error.message })
  if (error instanceof JokerQuotaError) return createError({ statusCode: 409, statusMessage: error.message })
  if (error instanceof ConflictError) return createError({ statusCode: 409, statusMessage: error.message })
  if (error instanceof ForbiddenError) return createError({ statusCode: 403, statusMessage: error.message })
  if (error instanceof ValidationError) return createError({ statusCode: 400, statusMessage: error.message })
  if (error instanceof StorageError) return createError({ statusCode: 500, statusMessage: error.message })
  // A raw unique violation reaching here is a lost write race (e.g. two
  // concurrent joins hitting the membership PK): a conflict, not a 500.
  if (isUniqueViolation(error)) return createError({ statusCode: 409, statusMessage: 'Conflicting concurrent request' })
  return error
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, cause } = error as { code?: string; cause?: unknown }
  return code === '23505' || isUniqueViolation(cause)
}
