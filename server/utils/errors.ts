export class NotFoundError extends Error {
  constructor(message = 'not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class LockedError extends Error {
  constructor(message = 'match is locked') {
    super(message)
    this.name = 'LockedError'
  }
}

export class JokerQuotaError extends Error {
  constructor(message = 'a joker has already been played this round') {
    super(message)
    this.name = 'JokerQuotaError'
  }
}

export class ValidationError extends Error {
  constructor(message = 'invalid input') {
    super(message)
    this.name = 'ValidationError'
  }
}

export class ConflictError extends Error {
  constructor(message = 'conflict') {
    super(message)
    this.name = 'ConflictError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

// A storage backend (fs/s3) failed or holds a blob the DB expects to be present.
// Infra-level, so it maps to 500 - distinct from a NotFoundError (a 404 a client
// can act on).
export class StorageError extends Error {
  constructor(message = 'storage error') {
    super(message)
    this.name = 'StorageError'
  }
}
