import { Router } from 'express'

export const authRouter = Router()

// Auth routes are handled by Better Auth in app.ts
// This file exports the router for structure; actual handler is in app.ts

authRouter.get('/me', (req, res) => {
  res.json({ message: 'Auth routes handled by Better Auth middleware' })
})

