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
