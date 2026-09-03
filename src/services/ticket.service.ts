import { inArray } from 'drizzle-orm'
import { ticket as ticketTable } from '../models/schema'
import * as ticketRepo from '../repositories/ticket.repository'
import * as userRepo from '../repositories/user.repository'
import * as projectRepo from '../repositories/project.repository'
import { BadRequestError, assertFound, ForbiddenError } from '../utils/errors'
import { VALIDATION, validateField, TicketStatus } from '../types/index'
import { TicketStatus as TS, TICKET_PRIORITY_CONFIG } from '../types/index'
import type { AuthenticatedUser } from './user.service'
import { getCurrentUser, getDeveloperList, getAccessibleClientIds, getClientApprovers } from './user.service'
import { getProjectNames } from './project.service'
import { getModuleNames } from './module.service'
import { EMAIL_LOG_PREFIX } from './email/email.constants'
import * as walletService from './wallet.service'
import { getFrontendUrl } from '../utils/frontend-url'
import { validateStatusTransition, isAwaitingClientReview, isClosedStatus } from '../lib/ticket-workflow'
import { serializeTicketForRole, serializeTicketsForRole, filterHistoryForClient } from '../lib/ticket-privacy'
import {
  dispatchUserNotification,
  type DispatchRecipient,
} from '../lib/notification-dispatcher'

/** Frontend portal URL used in email notification links. */
const PORTAL_URL = getFrontendUrl()

function generateTicketNumber(): string {
  const prefix = 'TKT'
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}-${timestamp}-${random}`
}

// ─── Access Helpers ───────────────────────────────────────────────────────

/**
 * Resolve the DB conditions that scope ticket queries to a user's role.
 * Clients see tickets from their entire organization (client tenant), so a
 * Standard Client's tickets are visible to their Client Approver and vice
 * versa — while other organizations remain fully isolated.
 */
async function buildRoleConditions(user: { id: string; role: string; accountId?: string | null }) {
  const conds: any[] = []
  if (user.role === 'client') {
    const clientIds = await getAccessibleClientIds(user)
    conds.push(inArray(ticketTable.clientId, clientIds))
  } else if (user.role === 'developer') {
    conds.push({ assignedToId: user.id })
  }
  return conds
}

/**
 * Assert the current user can view the given ticket.
 * Throws ForbiddenError when they cannot.
 */
async function assertTicketAccess(t: any, user: { id: string; role: string; accountId?: string | null }): Promise<void> {
  if (user.role === 'admin') return
  if (user.role === 'developer') {
    if (t.assignedToId !== user.id) throw new ForbiddenError('Access denied')
    return
  }
  if (user.role === 'project_manager') {
    if (t.projectId) {
      const project = await projectRepo.findById(t.projectId).catch(() => null)
      if (project && project.managerId === user.id) return
    }
    throw new ForbiddenError('Access denied')
  }
  if (user.role === 'client') {
    const clientIds = await getAccessibleClientIds(user)
    if (clientIds.includes(t.clientId)) return
    throw new ForbiddenError('Access denied')
  }
  throw new ForbiddenError('Access denied')
}

/**
 * Resolve a ticket's client recipients (creator + approvers) for notifications.
 * Recipients are always resolved server-side from the ticket creator's tenant
 * (Requirement #10) — never trusted from the request body.
 */
async function resolveClientRecipients(clientId: string): Promise<DispatchRecipient[]> {
  const creator = await userRepo.findByPk(clientId).catch(() => null)
  const out: DispatchRecipient[] = []
  if (creator) {
    out.push({
      id: creator.id,
      email: creator.email,
      name: creator.name,
      role: 'client',
      enableTeamsNotifications: creator.enableTeamsNotifications ?? false,
    })
  }

  if (creator?.accountId) {
    const approvers = await getClientApprovers({ id: creator.id, role: 'client', accountId: creator.accountId })
    for (const a of approvers) {
      if (a.id !== creator.id && !out.some(r => r.email.toLowerCase() === a.email.toLowerCase())) {
        out.push({
          id: a.id,
          email: a.email,
          name: a.name,
          role: 'client',
          enableTeamsNotifications: a.enableTeamsNotifications ?? false,
        })
      }
    }
  }
  return out
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

export async function createTicket(data: any, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)

  const titleErr = validateField(data.title, VALIDATION.TICKET_TITLE_MAX_LENGTH, 'Title')
  if (titleErr) throw new BadRequestError(titleErr)
  const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
  if (descErr) throw new BadRequestError(descErr)

  // A client may only attach a project that belongs to their organization.
  if (userData.role === 'client' && data.projectId) {
    const project = await projectRepo.findById(data.projectId).catch(() => null)
    if (!project) throw new BadRequestError('Project not found')
    const clientIds = await getAccessibleClientIds(userData)
    if (!clientIds.includes(project.clientId)) throw new ForbiddenError('Access denied')
  }

  const ticketNumber = generateTicketNumber()
  const isDraft = data.status === 'draft' || data.draft === true
  const initialStatus = isDraft ? TS.DRAFT : TicketStatus.NEW

  const newTicket = await ticketRepo.create({
    ticketNumber,
    title: data.title,
    description: data.description,
    type: data.type || 'general',
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
    estimatedCompletionDate: data.estimatedCompletionDate ?? null,
    estimateNotes: data.estimateNotes ?? null,
    // Assignment fields (managers only — validated by the frontend, enforced below)
    assignedToId: data.assignedToId ?? null,
    assignedById: data.assignedToId ? userData.id : null,
    assignedAt: data.assignedToId ? new Date() : null,
  })

  await ticketRepo.createHistory({
    ticketId: newTicket.id,
    userId: userData.id,
    action: data.isOverrideTicket ? 'override_created' : isDraft ? 'draft_created' : 'created',
    newValue: data.isOverrideTicket ? `Override ticket created (${data.overrideReason})` : isDraft ? 'Ticket draft saved' : 'Ticket created',
  })

  // Send Ticket Created email to project manager (fire-and-forget) — never for drafts
  if (data.projectId && !isDraft) {
    notifyManagerTicketCreated(data.projectId, newTicket, data, userData).catch(() => {/* ignore */})
  }

  return serializeTicketForRole(newTicket, userData.role)
}

export async function getTicketList(currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const conditions = await buildRoleConditions(userData)
  const tickets = await ticketRepo.findMany(conditions)
  return serializeTicketsForRole(tickets, userData.role)
}

export async function getTicketById(ticketId: number, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')
  await assertTicketAccess(t, userData)
  return serializeTicketForRole(t, userData.role)
}

export async function updateTicketStatus(ticketId: number, newStatus: string, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')
  await assertTicketAccess(t, userData)

  // ─── Authoritative state machine ────────────────────────────────────────
  // The backend is the source of truth for ticket status. Invalid direct
  // transitions and unauthorized role actions are rejected here.
  const transitionError = validateStatusTransition(t.status, newStatus, userData.role)
  if (transitionError) throw new BadRequestError(transitionError)

  const updateData: Record<string, unknown> = { status: newStatus, updatedAt: new Date() }
  if (isAwaitingClientReview(newStatus)) updateData.resolvedAt = new Date()
  if (isClosedStatus(newStatus)) updateData.closedAt = new Date()

  await ticketRepo.update(ticketId, updateData)
  await ticketRepo.createHistory({ ticketId, userId: userData.id, action: 'status_change', newValue: `Status changed to ${newStatus}` })

  // When a ticket is CLOSED, consume estimated hours from the client's wallet
  if (isClosedStatus(newStatus) && t.clientId && t.estimatedHours) {
    consumeWalletHours(t, userData).catch((err) => {
      console.error(`${EMAIL_LOG_PREFIX} consumeWalletHours error for ticket #${ticketId}:`, err)
    })
  }

  // Centralized notification dispatch — in-app + email + Teams, each gated by
  // the recipient's per-event preference (Requirement #14) and never dependent
  // on the frontend remembering to send an email (Requirement #21).
  notifyStatusChange(t, newStatus, userData).catch(() => {/* ignore */})

  const updated = await ticketRepo.findById(ticketId)
  return serializeTicketForRole(updated, userData.role)
}

/**
 * Update ticket dropdown fields (Create Ticket → Save Draft / Edit).
 * Clients may only edit their own draft tickets; managers/admins may edit any
 * ticket they can access. Provided fields are persisted — nulls are stored
 * explicitly, never silently dropped.
 */
export async function updateTicket(ticketId: number, data: any, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')
  await assertTicketAccess(t, userData)

  const isCreatorClient = userData.role === 'client' && (await getAccessibleClientIds(userData)).includes(t.clientId)
  const canEdit = userData.role === 'admin' || userData.role === 'project_manager' || (isCreatorClient && t.status === TS.DRAFT)
  if (!canEdit) {
    throw new ForbiddenError('You can only edit your own draft tickets')
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  const fields: [string, any][] = [
    ['title', data.title],
    ['description', data.description],
    ['type', data.type],
    ['priority', data.priority],
    ['category', data.category],
    ['projectId', data.projectId],
    ['moduleId', data.moduleId],
    ['estimatedHours', data.estimatedHours],
    ['estimatedCompletionDate', data.estimatedCompletionDate],
    ['estimateNotes', data.estimateNotes],
  ]

  for (const [key, value] of fields) {
    if (value !== undefined) {
      if (value === null || value === '') {
        updateData[key] = null
      } else if (key === 'title') {
        const err = validateField(value, VALIDATION.TICKET_TITLE_MAX_LENGTH, 'Title')
        if (err) throw new BadRequestError(err)
        updateData[key] = value
      } else if (key === 'description') {
        const err = validateField(value, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
        if (err) throw new BadRequestError(err)
        updateData[key] = value
      } else if (key === 'priority' || key === 'category' || key === 'type') {
        updateData[key] = value
      } else {
        updateData[key] = value
      }
    }
  }

  if (Object.keys(updateData).length === 1) {
    throw new BadRequestError('Nothing to update')
  }

  await ticketRepo.update(ticketId, updateData)
  await ticketRepo.createHistory({ ticketId, userId: userData.id, action: 'ticket_updated', newValue: 'Ticket details updated' })
  return serializeTicketForRole(await ticketRepo.findById(ticketId), userData.role)
}

export async function assignTicket(ticketId: number, developerId: string, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')

  // Only managers and admins may assign tickets — never accept arbitrary IDs.
  if (userData.role !== 'project_manager' && userData.role !== 'admin') {
    throw new ForbiddenError('Only managers can assign tickets')
  }
  await assertTicketAccess(t, userData)

  const developer = await userRepo.findByPk(developerId)
  if (!developer) throw new BadRequestError('Developer not found')
  if (developer.role !== 'developer') throw new BadRequestError('Assigned user is not a developer')

  await ticketRepo.update(ticketId, {
    assignedToId: developerId,
    assignedById: userData.id,
    assignedAt: new Date(),
    status: TS.ASSIGNED,
    updatedAt: new Date(),
  })
  await ticketRepo.createHistory({ ticketId, userId: userData.id, action: 'assigned', newValue: `Assigned to developer ${developerId}` })

  // Centralized notification: in-app + email + Teams (per developer preferences)
  notifyDeveloperTicketAssigned(developerId, t, userData).catch(() => {/* ignore */})
}

export async function addComment(ticketId: number, content: string, isInternal: boolean, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')
  await assertTicketAccess(t, userData)

  const commentErr = validateField(content, VALIDATION.COMMENT_MAX_LENGTH, 'Comment')
  if (commentErr) throw new BadRequestError(commentErr)

  const newComment = await ticketRepo.createComment({ ticketId, userId: userData.id, content, isInternal })
  await ticketRepo.createHistory({ ticketId, userId: userData.id, action: isInternal ? 'internal_note' : 'comment', newValue: 'Comment added' })
  return newComment
}

export async function getComments(ticketId: number, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')
  await assertTicketAccess(t, userData)

  const publicOnly = userData.role === 'client'
  const comments = await ticketRepo.findComments(ticketId, publicOnly)

  const userIds = [...new Set(comments.map(c => c.userId))]
  const users = await userRepo.findByIds(userIds)
  const userMap = new Map(users.map(u => [u.id, u]))

  // Privacy: clients never see the identity (name/role) of internal staff.
  if (userData.role === 'client') {
    return comments.map(c => {
      const author = userMap.get(c.userId)
      const isInternalStaff = author && author.role !== 'client'
      return {
        ...c,
        userName: isInternalStaff ? undefined : (author?.name || 'Unknown'),
        userRole: isInternalStaff ? undefined : (author?.role || 'client'),
      }
    })
  }

  return comments.map(c => ({
    ...c,
    userName: userMap.get(c.userId)?.name || 'Unknown',
    userRole: userMap.get(c.userId)?.role || 'client',
  }))
}

export async function getTicketHistory(ticketId: number, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')
  await assertTicketAccess(t, userData)

  const history = await ticketRepo.findHistory(ticketId)
  const userIds = [...new Set(history.map(h => h.userId))]
  const users = await userRepo.findByIds(userIds)
  const userMap = new Map(users.map(u => [u.id, u.name]))

  const withNames = history.map(h => ({ ...h, userName: userMap.get(h.userId) || 'Unknown' }))

  // Clients only receive client-safe activities, with actor identity removed
  // so developer/manager names can never leak through activity.
  if (userData.role === 'client') {
    return filterHistoryForClient(withNames)
  }

  return withNames
}

// ─── Priority / Dates ────────────────────────────────────────────────────

/** Manager (or admin) can change a ticket's priority. */
export async function changePriority(ticketId: number, priority: string, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  if (userData.role !== 'project_manager' && userData.role !== 'admin') {
    throw new ForbiddenError('Only managers can change ticket priority')
  }

  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')
  await assertTicketAccess(t, userData)

  if (!TICKET_PRIORITY_CONFIG[priority as keyof typeof TICKET_PRIORITY_CONFIG]) {
    throw new BadRequestError(`Invalid priority: ${priority}`)
  }

  await ticketRepo.update(ticketId, { priority, updatedAt: new Date() })
  await ticketRepo.createHistory({ ticketId, userId: userData.id, action: 'priority_changed', newValue: `Priority changed to ${priority}` })

  const updated = await ticketRepo.findById(ticketId)
  return serializeTicketForRole(updated, userData.role)
}

/** Admin-only: change ticket creation / closing dates. */
export async function changeTicketDates(
  ticketId: number,
  data: { createdAt?: string; closedAt?: string },
  currentUser: AuthenticatedUser,
) {
  const userData = await getCurrentUser(currentUser)
  if (userData.role !== 'admin') {
    throw new ForbiddenError('Only admins can change ticket dates')
  }

  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  const changes: string[] = []

  if (data.createdAt !== undefined) {
    const parsed = new Date(data.createdAt)
    if (Number.isNaN(parsed.getTime())) throw new BadRequestError('Invalid createdAt date')
    updateData.createdAt = parsed
    changes.push(`creation date → ${parsed.toISOString()}`)
  }
  if (data.closedAt !== undefined) {
    if (data.closedAt === null || data.closedAt === '') {
      updateData.closedAt = null
      changes.push('closing date cleared')
    } else {
      const parsed = new Date(data.closedAt)
      if (Number.isNaN(parsed.getTime())) throw new BadRequestError('Invalid closedAt date')
      updateData.closedAt = parsed
      changes.push(`closing date → ${parsed.toISOString()}`)
    }
  }
  if (changes.length === 0) throw new BadRequestError('Nothing to update')

  await ticketRepo.update(ticketId, updateData)
  await ticketRepo.createHistory({
    ticketId,
    userId: userData.id,
    action: 'dates_changed',
    newValue: `Dates changed by ${userData.name}: ${changes.join(', ')}`,
  })

  return ticketRepo.findById(ticketId)
}

// ─── Timer ────────────────────────────────────────────────────────────────

export async function startTimer(ticketId: number, description: string | undefined, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')
  await assertTicketAccess(t, userData)
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
  if (log.userId !== userData.id) throw new ForbiddenError('Not your time log')

  const endTime = new Date()
  const durationMinutes = Math.round((endTime.getTime() - log.startTime.getTime()) / 60000)
  await ticketRepo.updateTimeLog(timeLogId, { endTime, durationMinutes, updatedAt: new Date() })
  return { ...log, endTime, durationMinutes }
}

export async function pauseTimer(timeLogId: number, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const log = await ticketRepo.findTimeLogById(timeLogId)
  assertFound(log, 'Time log not found')
  if (log.userId !== userData.id) throw new ForbiddenError('Not your time log')

  const pauseTime = new Date()
  const elapsedMinutes = Math.round((pauseTime.getTime() - log.startTime.getTime()) / 60000)
  await ticketRepo.updateTimeLog(timeLogId, { endTime: pauseTime, durationMinutes: elapsedMinutes, updatedAt: new Date() })
  return { ...log, endTime: pauseTime, durationMinutes: elapsedMinutes, paused: true }
}

export async function resumeTimer(timeLogId: number, ticketId: number, description: string | undefined, currentUser: AuthenticatedUser) {
  const userData = await getCurrentUser(currentUser)
  const t = await ticketRepo.findById(ticketId)
  assertFound(t, 'Ticket not found')
  await assertTicketAccess(t, userData)
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

// ─── Status-Change Notification Dispatch ────────────────────────────────────
// Every notification event below flows through dispatchUserNotification(), the
// centralized dispatcher, which consults the recipient's per-channel
// preferences before creating the in-app row, sending the email (only where an
// email template exists) or posting to Teams (only when Teams is configured).

async function notifyStatusChange(t: any, newStatus: string, userData: any): Promise<void> {
  const ticketLink = `${PORTAL_URL}/dashboard/tickets/${t.id}`

  // Ticket assigned (status-driven path — assignment via assignTicket() is the
  // primary path and dispatches in-app + email + Teams there).
  if (newStatus === TS.ASSIGNED && t.assignedToId) {
    const dev = await userRepo.findByPk(t.assignedToId).catch(() => null)
    if (dev) {
      await dispatchUserNotification(
        { id: dev.id, name: dev.name, email: dev.email, role: 'developer', enableTeamsNotifications: dev.enableTeamsNotifications ?? false },
        'ticket_assigned',
        {
          email: dev.email,
          title: 'Ticket Assigned',
          message: `Ticket #${t.ticketNumber} has been assigned to you.`,
          eventType: 'ticket_assigned',
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          url: ticketLink,
        },
        { inApp: { title: 'Ticket Assigned', message: `Ticket #${t.ticketNumber} has been assigned to you.`, link: ticketLink, ticketId: t.id } },
      )
    }
  }

  // Developer completed work → Manager Review. Manager is notified in-app and
  // (when configured) on Teams. No manager-review email template exists, so no
  // email is generated — nothing is invented.
  if (newStatus === TS.MANAGER_REVIEW && t.projectId) {
    const project = await projectRepo.findById(t.projectId).catch(() => null)
    if (project?.managerId) {
      const manager = await userRepo.findByPk(project.managerId).catch(() => null)
      if (manager) {
        await dispatchUserNotification(
          { id: manager.id, name: manager.name, email: manager.email, role: manager.role || 'project_manager', enableTeamsNotifications: manager.enableTeamsNotifications ?? false },
          'manager_review',
          {
            email: manager.email,
            title: 'Ticket Ready for Manager Review',
            message: `Ticket #${t.ticketNumber} — ${t.title} is ready for your review.`,
            eventType: 'manager_review',
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            developerName: userData.name,
            url: ticketLink,
          },
          { inApp: { title: 'Ticket Ready for Manager Review', message: `Ticket #${t.ticketNumber} — ${t.title} is ready for your review.`, link: ticketLink, ticketId: t.id } },
        )
      }
    }
  }

  // Awaiting Client Review → the client org (creator + approver) is notified
  // in-app, by email (Ready for Review) and on Teams when configured.
  if (isAwaitingClientReview(newStatus) && t.clientId) {
    const recipients = await resolveClientRecipients(t.clientId)
    for (const r of recipients) {
      await dispatchUserNotification(
        r,
        'client_review',
        {
          email: r.email,
          title: 'Awaiting Your Review',
          message: `Ticket #${t.ticketNumber} — ${t.title} is ready for your review.`,
          eventType: 'client_review',
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          createdBy: userData.name,
          url: ticketLink,
        },
        { inApp: { title: 'Awaiting Your Review', message: `Ticket #${t.ticketNumber} — ${t.title} is ready for your review.`, link: ticketLink, ticketId: t.id } },
      )
    }
  }

  // Ticket closed → the client org is notified in-app, by email and on Teams.
  if (isClosedStatus(newStatus) && t.clientId) {
    const recipients = await resolveClientRecipients(t.clientId)
    for (const r of recipients) {
      await dispatchUserNotification(
        r,
        'ticket_closed',
        {
          email: r.email,
          title: 'Ticket Closed',
          message: `Ticket #${t.ticketNumber} — ${t.title} has been closed.`,
          eventType: 'ticket_closed',
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          createdBy: userData.name,
          url: ticketLink,
        },
        { inApp: { title: 'Ticket Closed', message: `Ticket #${t.ticketNumber} — ${t.title} has been closed.`, link: ticketLink, ticketId: t.id } },
      )
    }
  }

  // Manager Rework → assigned developer is notified (in-app + Teams when
  // configured). Distinct from client Request for Revision — see below.
  if (newStatus === TS.REWORK && t.assignedToId) {
    const dev = await userRepo.findByPk(t.assignedToId).catch(() => null)
    if (dev) {
      await dispatchUserNotification(
        { id: dev.id, name: dev.name, email: dev.email, role: 'developer', enableTeamsNotifications: dev.enableTeamsNotifications ?? false },
        'rework',
        {
          email: dev.email,
          title: 'Rework Requested',
          message: `Ticket #${t.ticketNumber} requires rework.`,
          eventType: 'rework',
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          url: ticketLink,
        },
        { inApp: { title: 'Rework Requested', message: `Ticket #${t.ticketNumber} requires rework.`, link: ticketLink, ticketId: t.id } },
      )
    }
  }

  // Client Requested for Revision → assigned developer is notified in-app, by
  // email (Revision Requested) and on Teams when configured.
  if (newStatus === TS.REQUEST_FOR_REVISION && t.assignedToId) {
    const dev = await userRepo.findByPk(t.assignedToId).catch(() => null)
    if (dev) {
      await dispatchUserNotification(
        { id: dev.id, name: dev.name, email: dev.email, role: 'developer', enableTeamsNotifications: dev.enableTeamsNotifications ?? false },
        'request_for_revision',
        {
          email: dev.email,
          title: 'Revision Requested',
          message: `Ticket #${t.ticketNumber} requires a revision.`,
          eventType: 'request_for_revision',
          ticketNumber: t.ticketNumber,
          ticketTitle: t.title,
          createdBy: userData.name,
          url: ticketLink,
        },
        { inApp: { title: 'Revision Requested', message: `Ticket #${t.ticketNumber} requires a revision.`, link: ticketLink, ticketId: t.id } },
      )
    }
  }

  // Estimate Approved by the client → the project manager is notified in-app,
  // by email (Estimate Approved) and on Teams. Every distinct approval is its
  // own backend status event — approvals are never globally suppressed and a
  // retry of the same event cannot be re-triggered because the transition only
  // fires once (the ticket no longer sits in estimate_pending).
  if (newStatus === TS.ESTIMATE_APPROVED && t.projectId) {
    const project = await projectRepo.findById(t.projectId).catch(() => null)
    if (project?.managerId) {
      const manager = await userRepo.findByPk(project.managerId).catch(() => null)
      if (manager) {
        await dispatchUserNotification(
          { id: manager.id, name: manager.name, email: manager.email, role: manager.role || 'project_manager', enableTeamsNotifications: manager.enableTeamsNotifications ?? false },
          'estimate_approved',
          {
            email: manager.email,
            title: 'Estimate Approved',
            message: `Ticket #${t.ticketNumber} — estimate approved by ${userData.name}.`,
            eventType: 'estimate_approved',
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title,
            clientName: userData.name,
            estimateHours: t.estimatedHours || 0,
            assignedTo: manager.name,
            url: ticketLink,
          },
          { inApp: { title: 'Estimate Approved', message: `Ticket #${t.ticketNumber} — estimate approved by ${userData.name}.`, link: ticketLink, ticketId: t.id } },
        )
      }
    }
  }
}

// ─── Email Notification Helpers (fire-and-forget) ──────────────────────────

/** Notify the project manager when a ticket is created (email + Teams when configured). */
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
    await dispatchUserNotification(
      {
        id: manager.id,
        name: manager.name,
        email: manager.email,
        role: manager.role || 'project_manager',
        enableTeamsNotifications: manager.enableTeamsNotifications ?? false,
      },
      'ticket_created',
      {
        email: manager.email,
        title: 'New Ticket Created',
        message: `Ticket #${newTicket.ticketNumber} — ${data.title} requires attention.`,
        eventType: 'ticket_created',
        ticketNumber: newTicket.ticketNumber,
        ticketTitle: data.title,
        projectName: project.projectName || '',
        priority: data.priority || 'medium',
        createdBy: userData.name,
        url: ticketLink,
      },
      { inApp: null, prefIndex: undefined },
    )
  } catch (err) {
    console.error(`${EMAIL_LOG_PREFIX} notifyManagerTicketCreated error:`, err)
  }
}

/**
 * Notify the assigned developer when a ticket is assigned.
 * Centralized, preference-aware: in-app + email + Teams (when configured).
 */
async function notifyDeveloperTicketAssigned(
  developerId: string,
  ticket: any,
  userData: any,
): Promise<void> {
  try {
    const developer = await userRepo.findByPk(developerId)
    if (!developer) return

    // Resolve client name (server-side, never from the request body)
    let clientName = 'Client'
    if (ticket.clientId) {
      const client = await userRepo.findByPk(ticket.clientId).catch(() => null)
      if (client) clientName = client.name
    }

    const ticketLink = `${PORTAL_URL}/dashboard/tickets/${ticket.id}`
    await dispatchUserNotification(
      {
        id: developer.id,
        name: developer.name,
        email: developer.email,
        role: developer.role || 'developer',
        enableTeamsNotifications: developer.enableTeamsNotifications ?? false,
      },
      'ticket_assigned',
      {
        email: developer.email,
        title: 'Ticket Assigned',
        message: `Ticket #${ticket.ticketNumber} has been assigned to you.`,
        eventType: 'ticket_assigned',
        ticketNumber: ticket.ticketNumber,
        ticketTitle: ticket.title,
        clientName,
        assignedTo: developer.name,
        developerName: developer.name,
        projectName: '',
        priority: ticket.priority || 'medium',
        url: ticketLink,
      },
      {
        inApp: {
          title: 'Ticket Assigned',
          message: `Ticket #${ticket.ticketNumber} has been assigned to you.`,
          link: ticketLink,
          ticketId: ticket.id,
        },
      },
    )
  } catch (err) {
    console.error(`${EMAIL_LOG_PREFIX} notifyDeveloperTicketAssigned error:`, err)
  }
}