import express from 'express'
import cors from 'cors'
// @ts-expect-error — compression package lacks types but works at runtime
import compression from 'compression'
import { auth } from './config/auth'
import { authRouter } from './routes/auth'
import { uploadRouter } from './routes/upload'
import { ticketsRouter } from './routes/tickets'
import { projectsRouter } from './routes/projects'
import { modulesRouter } from './routes/modules'
import { walletsRouter } from './routes/wallets'
import { notificationsRouter } from './routes/notifications'
import { reportsRouter } from './routes/reports'
import { attachmentsRouter } from './routes/attachments'
import { onboardingRouter } from './routes/onboarding'
import { errorHandler } from './middleware/error-handler'
import { routeTimingMiddleware } from './lib/performance-profiler'
import devEmailRoutes from "./routes/dev-email"
import emailNotificationRoutes from "./routes/email-notification"
import teamsNotificationRoutes from "./routes/teams-notification"
import bootstrapRouter from './routes/bootstrap'

export const app = express()

// ─── Middleware ──────────────────────────────────────────────────────────
//temp signup
app.use('/api/bootstrap', bootstrapRouter)
// Compression — gzip/brotli for all API responses
app.use(compression())

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// ─── Better Auth handler ────────────────────────────────────────────────
app.use('/api/auth', (req, res, next) => {
  const handler = auth.handler(req as any)
  handler.catch(next)
})

// ─── API Routes (with timing) ────────────────────────────────────────────
app.use('/api/upload', routeTimingMiddleware('Upload'), uploadRouter)
app.use('/api/tickets', routeTimingMiddleware('Tickets'), ticketsRouter)
app.use('/api/projects', routeTimingMiddleware('Projects'), projectsRouter)
app.use('/api/modules', routeTimingMiddleware('Modules'), modulesRouter)
app.use('/api/wallets', routeTimingMiddleware('Wallets'), walletsRouter)
app.use('/api/notifications', routeTimingMiddleware('Notifications'), notificationsRouter)
app.use('/api/reports', routeTimingMiddleware('Reports'), reportsRouter)
app.use('/api/attachments', routeTimingMiddleware('Attachments'), attachmentsRouter)
app.use('/api/onboarding', routeTimingMiddleware('Onboarding'), onboardingRouter)
app.use("/api/dev", devEmailRoutes)
console.log("✅ Dev Email Route Registered");

// ─── Email Notifications (fire-and-forget from frontend actions) ──────────
app.use('/api/email', routeTimingMiddleware('Email'), emailNotificationRoutes)

// ─── Teams Notifications ───────────────────────────────────────────────
app.use('/api/teams', routeTimingMiddleware('Teams'), teamsNotificationRoutes)
// ─── Health Check ─────────────────────────────────────────────────────
app.get('/api/health', routeTimingMiddleware('Health'), (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ─── Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler)
