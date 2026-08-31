import * as ticketRepo from '../repositories/ticket.repository'
import * as userRepo from '../repositories/user.repository'
import * as projectRepo from '../repositories/project.repository'
import * as moduleRepo from '../repositories/module.repository'
import { BadRequestError, assertFound, assertAccess } from '../utils/errors'
import { VALIDATION, validateField, TicketStatus } from '../types/index'
import { TicketStatus as TS } from '../types/index'
import type { AuthenticatedUser } from './user.service'
import { getCurrentUser, getDeveloperList } from './user.service'
import { getProjectNames } from './project.service'
import { getModuleNames } from './module.service'
import { sendTicketCreated, sendTicketAssigned, sendTicketResolved, sendTicketClosed } from './email/email.service'
import { EMAIL_LOG_PREFIX } from './email/email.constants'
import * as walletService from './wallet.service'

/** Frontend portal URL used in email notification links. */
const PORTAL_URL = process.env.FRONTEND_URL;

if (!PORTAL_URL) {
  throw new Error('FRONTEND_URL is not configured');
}
function generateTicketNumber(): string {
  const prefix = 'TKT'
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}-${timestamp}-${random}`
}

/** Build role-based permission conditions for ticket queries. */
function buildRoleConditions(user: { id: string; role: string }) {
  const conds: any[] = []
  if (user.role === 'client') conds.push({ clientId: user.id })
  else if (user.role === 'developer') conds.push({ assignedToId: user.id })
  return conds
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

export async function createTicket(data: any, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)

  const titleErr = validateField(data.title, VALIDATION.TICKET_TITLE_MAX_LENGTH, 'Title')
  if (titleErr) throw new BadRequestError(titleErr)
  const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
  if (descErr) throw new BadRequestError(descErr)

  const ticketNumber = generateTicketNumber()
  const initialStatus = TicketStatus.NEW

  const newTicket = await ticketRepo.create({
    ticketNumber,
    title: data.title,
    description: data.description,
    priority: data.priority || 'medium',
    category: data.category || 'general',
    status: initialStatus,
    clientId: userData.id,
    projectId: data.projectId ?? null,
    moduleId: data.moduleId ?? null,
    isOverrideTicket: data.isOverrideTicket ?? false,
    overrideReason: data.isOverrideTicket ? (data.overrideReason ?? null) : null,
    overrideBy: data.isOverrideTicket ? userData.id : null,
    overrideDate: data.isOverrideTicket ? new Date() : null,
    estimatedHours: data.estimatedHours ?? null,
  })

  await ticketRepo.createHistory({
    ticketId: newTicket.id,
    userId: userData.id,
    action: data.isOverrideTicket ? 'override_created' : 'created',
    newValue: data.isOverrideTicket ? `Override ticket created (${data.overrideReason})` : 'Ticket created',
  })

  // Send Ticket Created email to project manager (fire-and-forget)
  if (data.projectId) {
    notifyManagerTicketCreated(data.projectId, newTicket, data, userData).catch(() => {/* ignore */})
  }

  return newTicket
}

export async function getTicketList(currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const conditions = buildRoleConditions(userData)
  return ticketRepo.findMany(conditions)
}

export async function getTicketById(ticketId: number, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')
  if (userData.role === 'client' && t.clientId !== userData.id) throw new (await import('../utils/errors')).ForbiddenError('Access denied')
  if (userData.role === 'developer' && t.assignedToId !== userData.id) throw new (await import('../utils/errors')).ForbiddenError('Access denied')
  return t
}

export async function updateTicketStatus(ticketId: number, newStatus: string, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')

  const updateData: Record<string, unknown> = { status: newStatus, updatedAt: new Date() }
  if (newStatus === TS.RESOLVED) updateData.resolvedAt = new Date()
  if (newStatus === TS.CLOSED) updateData.closedAt = new Date()

  await ticketRepo.update(ticketId, updateData)
  await ticketRepo.createHistory({ ticketId, userId: userData.id, action: 'status_change', newValue: `Status changed to ${newStatus}` })

  // When a ticket is CLOSED, consume estimated hours from the client's wallet
  if (newStatus === TS.CLOSED && t.clientId && t.estimatedHours) {
    consumeWalletHours(t, userData).catch((err) => {
      console.error(`${EMAIL_LOG_PREFIX} consumeWalletHours error for ticket #${ticketId}:`, err)
    })
  }

  // Send email notifications based on status change (fire-and-forget)
  if (newStatus === TS.RESOLVED && t.clientId) {
    notifyClientTicketResolved(t.clientId, t, userData).catch(() => {/* ignore */})
  } else if (newStatus === TS.CLOSED && t.clientId) {
    notifyClientTicketClosed(t.clientId, t, userData).catch(() => {/* ignore */})
  }
}

export async function assignTicket(ticketId: number, developerId: string, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')

  await ticketRepo.update(ticketId, {
    assignedToId: developerId,
    assignedById: userData.id,
    assignedAt: new Date(),
    status: TS.ASSIGNED,
    updatedAt: new Date(),
  })
  await ticketRepo.createHistory({ ticketId, userId: userData.id, action: 'assigned', newValue: `Assigned to developer ${developerId}` })

  // Send Ticket Assigned email to developer (fire-and-forget)
  notifyDeveloperTicketAssigned(developerId, t, userData).catch(() => {/* ignore */})
}

export async function addComment(ticketId: number, content: string, isInternal: boolean, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const commentErr = validateField(content, VALIDATION.COMMENT_MAX_LENGTH, 'Comment')
  if (commentErr) throw new BadRequestError(commentErr)

  const newComment = await ticketRepo.createComment({ ticketId, userId: userData.id, content, isInternal })
  await ticketRepo.createHistory({ ticketId, userId: userData.id, action: isInternal ? 'internal_note' : 'comment', newValue: 'Comment added' })
  return newComment
}

export async function getComments(ticketId: number, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const publicOnly = userData.role === 'client'
  const comments = await ticketRepo.findComments(ticketId, publicOnly)

  const userIds = [...new Set(comments.map(c => c.userId))]
  const users = await userRepo.findByIds(userIds)
  const userMap = new Map(users.map(u => [u.id, u]))

  return comments.map(c => ({
    ...c,
    userName: userMap.get(c.userId)?.name || 'Unknown',
    userRole: userMap.get(c.userId)?.role || 'client',
  }))
}

export async function getTicketHistory(ticketId: number) {
  const history = await ticketRepo.findHistory(ticketId)
  const userIds = [...new Set(history.map(h => h.userId))]
  const users = await userRepo.findByIds(userIds)
  const userMap = new Map(users.map(u => [u.id, u.name]))

  return history.map(h => ({ ...h, userName: userMap.get(h.userId) || 'Unknown' }))
}

// ─── Timer ────────────────────────────────────────────────────────────────

export async function startTimer(ticketId: number, description: string | undefined, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  if (description) {
    const descErr = validateField(description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Timer description')
    if (descErr) throw new BadRequestError(descErr)
  }
  const newLog = await ticketRepo.createTimeLog({ ticketId, userId: userData.id, description, startTime: new Date(), isBillable: true })
  await ticketRepo.createHistory({ ticketId, userId: userData.id, action: 'timer_started', newValue: 'Timer started' })
  return newLog
}

export async function stopTimer(timeLogId: number, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const log = await ticketRepo.findTimeLogById(timeLogId)
  assertFound(log, 'Time log not found')
  assertAccess(log.userId === userData.id, 'Not your time log')

  const endTime = new Date()
  const durationMinutes = Math.round((endTime.getTime() - log.startTime.getTime()) / 60000)
  await ticketRepo.updateTimeLog(timeLogId, { endTime, durationMinutes, updatedAt: new Date() })
  return { ...log, endTime, durationMinutes }
}

export async function pauseTimer(timeLogId: number, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const log = await ticketRepo.findTimeLogById(timeLogId)
  assertFound(log, 'Time log not found')
  assertAccess(log.userId === userData.id, 'Not your time log')

  const pauseTime = new Date()
  const elapsedMinutes = Math.round((pauseTime.getTime() - log.startTime.getTime()) / 60000)
  await ticketRepo.updateTimeLog(timeLogId, { endTime: pauseTime, durationMinutes: elapsedMinutes, updatedAt: new Date() })
  return { ...log, endTime: pauseTime, durationMinutes: elapsedMinutes, paused: true }
}

export async function resumeTimer(timeLogId: number, ticketId: number, description: string | undefined, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  if (description) {
    const descErr = validateField(description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Timer description')
    if (descErr) throw new BadRequestError(descErr)
  }
  const newLog = await ticketRepo.createTimeLog({ ticketId, userId: userData.id, description, startTime: new Date(), isBillable: true })
  await ticketRepo.createHistory({ ticketId, userId: userData.id, action: 'timer_resumed', newValue: 'Timer resumed' })
  return newLog
}

// ─── Wallet Hour Consumption ─────────────────────────────────────────────

/**
 * Consume support hours from the client's wallet when a ticket is closed.
 * Wallet is resolved through clientId (one wallet per client).
 * Project/module context is preserved in the transaction metadata.
 */
async function consumeWalletHours(
  ticket: {
    id: number
    clientId: string
    projectId: number | null
    moduleId: number | null
    estimatedHours: number | null
    consumedHours: number | null
    ticketNumber: string
    title: string
  },
  userData: { id: string; name: string },
): Promise<void> {
  const hoursToDeduct = ticket.consumedHours ?? ticket.estimatedHours ?? 0
  if (hoursToDeduct <= 0) return

  const result = await walletService.deductHoursFromWallet({
    clientId: ticket.clientId,
    hours: hoursToDeduct,
    ticketId: ticket.id,
    projectId: ticket.projectId,
    moduleId: ticket.moduleId,
    performedBy: userData.name || userData.id,
    reason: `Ticket ${ticket.ticketNumber} closed — ${ticket.title}`,
  })

  if (result) {
    console.log(
      `[Wallet] Consumed ${hoursToDeduct}h from client ${ticket.clientId} wallet for ticket ${ticket.ticketNumber}. ` +
      `Balance: ${result.previousBalance}h → ${result.newBalance}h`,
    )

    // Check for low balance after deduction
    if (result.newBalance <= 20 && result.previousBalance > 20) {
      console.log(`[Wallet] ⚠️ Low balance warning for client ${ticket.clientId}: ${result.newBalance}h remaining`)
    }
  }
}

// ─── Aggregated Page Data ─────────────────────────────────────────────────

export async function getTicketPageData(currentUser: AuthenticatedUser) {
  const [tickets, developers, projects, modules] = await Promise.all([
    getTicketList(currentUser),
    getDeveloperList(),
    getProjectNames(),
    getModuleNames(),
  ])
  return { tickets, developers, projects, modules }
}

// ─── Email Notification Helpers (fire-and-forget) ──────────────────────────

/** Notify the project manager when a ticket is created. */
async function notifyManagerTicketCreated(
  projectId: number,
  newTicket: any,
  data: any,
  userData: any,
): Promise<void> {
  try {
    const project = await projectRepo.findById(projectId)
    if (!project || !project.managerId) return
    const manager = await userRepo.findByPk(project.managerId)
    if (!manager) return

    const ticketLink = `${PORTAL_URL}/dashboard/tickets/${newTicket.id}`
    sendTicketCreated(manager.email, {
      ticketNumber: newTicket.ticketNumber,
      ticketTitle: data.title,
      projectName: project.projectName || '',
      priority: data.priority || 'medium',
      createdBy: userData.name,
      createdDate: new Date().toISOString().split('T')[0],
      ticketLink,
    })
  } catch (err) {
    console.error(`${EMAIL_LOG_PREFIX} notifyManagerTicketCreated error:`, err)
  }
}

/** Notify the client when a ticket is resolved. */
async function notifyClientTicketResolved(
  clientId: string,
  ticket: any,
  userData: any,
): Promise<void> {
  try {
    const client = await userRepo.findByPk(clientId)
    if (!client) return

    const ticketLink = `${PORTAL_URL}/dashboard/tickets/${ticket.id}`
    sendTicketResolved(client.email, {
      ticketNumber: ticket.ticketNumber,
      ticketTitle: ticket.title,
      resolvedBy: userData.name,
      resolutionSummary: '',
      ticketLink,
    })
  } catch (err) {
    console.error(`${EMAIL_LOG_PREFIX} notifyClientTicketResolved error:`, err)
  }
}

/** Notify the client when a ticket is closed. */
async function notifyClientTicketClosed(
  clientId: string,
  ticket: any,
  userData: any,
): Promise<void> {
  try {
    const client = await userRepo.findByPk(clientId)
    if (!client) return

    const ticketLink = `${PORTAL_URL}/dashboard/tickets/${ticket.id}`
    sendTicketClosed(client.email, {
      ticketNumber: ticket.ticketNumber,
      ticketTitle: ticket.title,
      closedBy: userData.name,
      resolutionTime: '',
    })
  } catch (err) {
    console.error(`${EMAIL_LOG_PREFIX} notifyClientTicketClosed error:`, err)
  }
}

/** Notify the assigned developer when a ticket is assigned. */
async function notifyDeveloperTicketAssigned(
  developerId: string,
  ticket: any,
  userData: any,
): Promise<void> {
  try {
    const developer = await userRepo.findByPk(developerId)
    if (!developer) return

    // Resolve client name
    let clientName = 'Client'
    if (ticket.clientId) {
      const client = await userRepo.findByPk(ticket.clientId).catch(() => null)
      if (client) clientName = client.name
    }

    const ticketLink = `${PORTAL_URL}/dashboard/tickets/${ticket.id}`
    sendTicketAssigned(developer.email, {
      ticketNumber: ticket.ticketNumber,
      ticketTitle: ticket.title,
      clientName,
      developerName: developer.name,
      projectName: '',
      priority: ticket.priority || 'medium',
      ticketLink,
    })
  } catch (err) {
    console.error(`${EMAIL_LOG_PREFIX} notifyDeveloperTicketAssigned error:`, err)
  }
}

