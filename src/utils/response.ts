import { Response } from 'express'

/**
 * Standardized API response helpers.
 */

export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200): void {
  res.status(statusCode).json(data)
}

export function sendError(res: Response, message: string, statusCode: number = 400): void {
  res.status(statusCode).json({ error: message })
}
