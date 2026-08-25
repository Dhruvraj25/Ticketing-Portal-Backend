import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'

const router = Router()
export const onboardingRouter = router

router.get('/clients', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await import('../config/db')
    const { user } = await import('../models/schema')
    const { eq } = await import('drizzle-orm')
    const clients = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.role, 'client')).orderBy(user.name)
    return res.json(clients)
  } catch (err: any) { return res.status(400).json({ error: err.message }) }
})

router.get('/managers', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await import('../config/db')
    const { user } = await import('../models/schema')
    const { eq } = await import('drizzle-orm')
    const managers = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.role, 'project_manager')).orderBy(user.name)
    return res.json(managers)
  } catch (err: any) { return res.status(400).json({ error: err.message }) }
})

router.get('/existing-modules', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await import('../config/db')
    const { module: moduleTable } = await import('../models/schema')
    const { eq } = await import('drizzle-orm')
    const modules = await db.select({ id: moduleTable.id, moduleName: moduleTable.moduleName, projectId: moduleTable.projectId }).from(moduleTable).where(eq(moduleTable.status, 'active')).orderBy(moduleTable.moduleName)
    const seen = new Set<string>()
    const unique = modules.filter((m: { id: number; moduleName: string; projectId: number }) => { const l = m.moduleName.toLowerCase(); if (seen.has(l)) return false; seen.add(l); return true })
    return res.json(unique)
  } catch (err: any) { return res.status(400).json({ error: err.message }) }
})

router.post('/check-duplicate-project', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await import('../config/db')
    const { project } = await import('../models/schema')
    const { and, eq, ne } = await import('drizzle-orm')
    const { projectName, clientId } = req.body
    const [existing] = await db.select({ id: project.id }).from(project).where(and(eq(project.projectName, projectName?.trim()), eq(project.clientId, clientId), ne(project.status, 'archived'))).limit(1)
    return res.json({ isDuplicate: !!existing })
  } catch (err: any) { return res.status(400).json({ error: err.message }) }
})

router.post('/check-duplicate-email', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await import('../config/db')
    const { user } = await import('../models/schema')
    const { eq } = await import('drizzle-orm')
    const { email } = req.body
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email?.trim())).limit(1)
    return res.json({ isDuplicate: !!existing })
  } catch (err: any) { return res.status(400).json({ error: err.message }) }
})

router.get('/history', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await import('../config/db')
    const { ticketHistory, user } = await import('../models/schema')
    const { eq, inArray, desc } = await import('drizzle-orm')
    const history = await db.select({ id: ticketHistory.id, userId: ticketHistory.userId, action: ticketHistory.action, newValue: ticketHistory.newValue, createdAt: ticketHistory.createdAt }).from(ticketHistory).where(eq(ticketHistory.action, 'Customer Onboarding Completed')).orderBy(desc(ticketHistory.createdAt)).limit(50)
    if (history.length === 0) return res.json([])
    const userIds = [...new Set(history.map((h: { userId: string }) => h.userId))]
    const users = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds))
    const userMap = new Map(users.map((u: { id: string; name: string }) => [u.id, u.name]))
    return res.json(history.map((h: { id: number; action: string; newValue: string | null; userId: string; createdAt: Date }) => ({ id: h.id, action: h.action, details: h.newValue, performedBy: userMap.get(h.userId) || 'Unknown', createdAt: h.createdAt })))
  } catch (err: any) { return res.status(400).json({ error: err.message }) }
})
