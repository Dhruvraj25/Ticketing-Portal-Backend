/**
 * Custom application error with HTTP status code support.
 */
export class AppError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean

  constructor(message: string, statusCode: number = 400, isOperational: boolean = true) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.isOperational = isOperational
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request') {
    super(message, 400)
    this.name = 'BadRequestError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(message, 409)
    this.name = 'ConflictError'
  }
}

export class InternalError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, false)
    this.name = 'InternalError'
  }
}

export function assertFound<T>(entity: T | null | undefined, message: string = 'Resource not found'): asserts entity is T {
  if (entity == null) throw new NotFoundError(message)
}

export function assertAccess(condition: boolean, message: string = 'Access denied'): asserts condition is true {
  if (!condition) throw new ForbiddenError(message)
}
