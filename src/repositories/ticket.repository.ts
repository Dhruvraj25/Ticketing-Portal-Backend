import { db } from '../config/db'
import { ticket, comment, ticketHistory, attachment, timeLog } from '../models/schema'
import { and, eq, desc, sql, isNull, isNotNull, ne, count, inArray, gte, lte, sum } from 'drizzle-orm'
import type { TicketStatus } from '../types/index'
import { TicketStatus as TS } from '../types/index'

// ─── Ticket CRUD ──────────────────────────────────────────────────────────

export async function create(data: any) {
  const [row] = await db.insert(ticket).values(data).returning()
  return row
}

export async function findById(id: number) {
  const [row] = await db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      description: ticket.description, status: ticket.status, priority: ticket.priority,
      category: ticket.category, clientId: ticket.clientId,
      assignedToId: ticket.assignedToId, assignedById: ticket.assignedById,
      projectId: ticket.projectId, moduleId: ticket.moduleId,
      assignedAt: ticket.assignedAt, resolvedAt: ticket.resolvedAt, closedAt: ticket.closedAt,
      isOverrideTicket: ticket.isOverrideTicket, overrideReason: ticket.overrideReason,
      overrideBy: ticket.overrideBy, overrideDate: ticket.overrideDate,
      estimatedHours: ticket.estimatedHours,
      estimatedCompletionDate: ticket.estimatedCompletionDate, estimateNotes: ticket.estimateNotes,
      estimateSubmittedAt: ticket.estimateSubmittedAt,
      estimateApprovedAt: ticket.estimateApprovedAt, estimateApprovedBy: ticket.estimateApprovedBy,
      autoApproved: ticket.autoApproved, autoApprovedAt: ticket.autoApprovedAt,
      approvalDeadline: ticket.approvalDeadline,
      additionalHoursRequested: ticket.additionalHoursRequested,
      additionalHoursApproved: ticket.additionalHoursApproved,
      additionalHoursApprovedBy: ticket.additionalHoursApprovedBy,
      additionalHoursAutoApproved: ticket.additionalHoursAutoApproved,
      additionalHoursDeadline: ticket.additionalHoursDeadline,
      reservedHours: ticket.reservedHours, consumedHours: ticket.consumedHours,
      revisionCount: ticket.revisionCount,
      createdAt: ticket.createdAt, updatedAt: ticket.updatedAt,
    })
    .from(ticket)
    .where(eq(ticket.id, id))
    .limit(1)
  return row ?? null
}

export async function findMany(conditions: any[], orderField?: any, limitVal?: number) {
  const query = db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      description: ticket.description, status: ticket.status, priority: ticket.priority,
      category: ticket.category, clientId: ticket.clientId,
      assignedToId: ticket.assignedToId, assignedById: ticket.assignedById,
      projectId: ticket.projectId, moduleId: ticket.moduleId,
      assignedAt: ticket.assignedAt, resolvedAt: ticket.resolvedAt, closedAt: ticket.closedAt,
      isOverrideTicket: ticket.isOverrideTicket, overrideReason: ticket.overrideReason,
      overrideBy: ticket.overrideBy, overrideDate: ticket.overrideDate,
      estimatedHours: ticket.estimatedHours,
      estimatedCompletionDate: ticket.estimatedCompletionDate,
      estimateNotes: ticket.estimateNotes,
      estimateSubmittedAt: ticket.estimateSubmittedAt,
      estimateApprovedAt: ticket.estimateApprovedAt,
      estimateApprovedBy: ticket.estimateApprovedBy,
      autoApproved: ticket.autoApproved, autoApprovedAt: ticket.autoApprovedAt,
      approvalDeadline: ticket.approvalDeadline,
      additionalHoursRequested: ticket.additionalHoursRequested,
      additionalHoursApproved: ticket.additionalHoursApproved,
      additionalHoursApprovedBy: ticket.additionalHoursApprovedBy,
      additionalHoursAutoApproved: ticket.additionalHoursAutoApproved,
      additionalHoursDeadline: ticket.additionalHoursDeadline,
      reservedHours: ticket.reservedHours, consumedHours: ticket.consumedHours,
      revisionCount: ticket.revisionCount,
      createdAt: ticket.createdAt, updatedAt: ticket.updatedAt,
    })
    .from(ticket)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(orderField || desc(ticket.createdAt))
  if (limitVal) query.limit(limitVal)
  return query
}

export async function update(id: number, data: Record<string, unknown>) {
  const [row] = await db.update(ticket).set(data).where(eq(ticket.id, id)).returning()
  return row
}

// ─── Aggregations ─────────────────────────────────────────────────────────

export async function countByProjectId(projectId: number) {
  const [row] = await db
    .select({ count: count() })
    .from(ticket)
    .where(eq(ticket.projectId, projectId))
  return Number(row?.count) || 0
}

export async function countByProjectIds(projectIds: number[]) {
  if (projectIds.length === 0) return []
  return db
    .select({ projectId: ticket.projectId, count: count() })
    .from(ticket)
    .where(inArray(ticket.projectId, projectIds))
    .groupBy(ticket.projectId)
}

export async function countByModuleId(moduleId: number) {
  const [row] = await db
    .select({ count: count() })
    .from(ticket)
    .where(eq(ticket.moduleId, moduleId))
  return Number(row?.count) || 0
}

export async function countByModuleIds(moduleIds: number[]) {
  if (moduleIds.length === 0) return []
  return db
    .select({ moduleId: ticket.moduleId, count: count() })
    .from(ticket)
    .where(inArray(ticket.moduleId, moduleIds))
    .groupBy(ticket.moduleId)
}

export async function statusCounts(conditions: any[]) {
  const rows = await db
    .select({ status: ticket.status, count: count() })
    .from(ticket)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(ticket.status)
  return rows
}

export async function assignedCounts(devIds: string[], statusFilter?: string) {
  const conds: any[] = [inArray(ticket.assignedToId, devIds)]
  if (statusFilter) conds.push(ne(ticket.status, statusFilter))
  return db
    .select({ assignedToId: ticket.assignedToId, count: count() })
    .from(ticket)
    .where(and(...conds))
    .groupBy(ticket.assignedToId)
}

export async function assignedStatusCounts(devIds: string[]) {
  return db
    .select({ assignedToId: ticket.assignedToId, status: ticket.status, count: count() })
    .from(ticket)
    .where(and(inArray(ticket.assignedToId, devIds), ne(ticket.status, TS.CLOSED)))
    .groupBy(ticket.assignedToId, ticket.status)
}

export async function openFilterCounts(conditions: any[]) {
  return db
    .select({ assignedToId: ticket.assignedToId, status: ticket.status, count: count() })
    .from(ticket)
    .where(and(...conditions))
    .groupBy(ticket.assignedToId, ticket.status)
}

export async function findStatusesByProjectId(projectId: number) {
  return db
    .select({ status: ticket.status })
    .from(ticket)
    .where(eq(ticket.projectId, projectId))
}

export async function findStatusesByModuleId(moduleId: number) {
  return db
    .select({ status: ticket.status })
    .from(ticket)
    .where(eq(ticket.moduleId, moduleId))
}

export async function findResolved(conditions: any[], limitVal: number = 200) {
  return db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      description: ticket.description, status: ticket.status, priority: ticket.priority,
      category: ticket.category, clientId: ticket.clientId,
      assignedToId: ticket.assignedToId, projectId: ticket.projectId,
      resolvedAt: ticket.resolvedAt, createdAt: ticket.createdAt,
    })
    .from(ticket)
    .where(and(isNotNull(ticket.resolvedAt), ...conditions))
    .orderBy(desc(ticket.resolvedAt))
    .limit(limitVal)
}

export async function findResolvedCounts(devIds: string[], since: Date) {
  return db
    .select({ assignedToId: ticket.assignedToId, count: count() })
    .from(ticket)
    .where(and(inArray(ticket.assignedToId, devIds), eq(ticket.status, TS.CLOSED), gte(ticket.createdAt, since)))
    .groupBy(ticket.assignedToId)
}

export async function findOpenAging(conditions: any[]) {
  return db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      status: ticket.status, priority: ticket.priority, clientId: ticket.clientId,
      assignedToId: ticket.assignedToId, projectId: ticket.projectId,
      createdAt: ticket.createdAt, updatedAt: ticket.updatedAt,
    })
    .from(ticket)
    .where(and(sql`${ticket.status} NOT IN (${TS.CLOSED})`, ...conditions))
    .orderBy(ticket.createdAt)
}

export async function kpiCounts() {
  const ps = db
    .select({ total: sql<number>`COUNT(*)::int`, active: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'open' OR ${ticket.status} = 'assigned' OR ${ticket.status} = 'in_progress' OR ${ticket.status} = 'reopened')::int` })
    .from(ticket)
  return ps
}

export async function statusFilterCounts() {
  return db
    .select({
      openCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} IN ('open','assigned','in_progress','reopened'))::int`,
      closedCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'closed')::int`,
    })
    .from(ticket)
}

// ─── Scalar subquery for project ticket count ────────────────────────────

export const ticketCountSubquery = (projectId: any) =>
  sql<number>`(SELECT COUNT(*)::int FROM ${ticket} WHERE ${ticket.projectId} = ${projectId})`.as('ticketCount')

// ─── Comments ─────────────────────────────────────────────────────────────

export async function findComments(ticketId: number, publicOnly: boolean = false) {
  const conds: any[] = [eq(comment.ticketId, ticketId)]
  if (publicOnly) conds.push(eq(comment.isInternal, false))
  return db
    .select({ id: comment.id, ticketId: comment.ticketId, userId: comment.userId,
      content: comment.content, isInternal: comment.isInternal,
      createdAt: comment.createdAt, updatedAt: comment.updatedAt })
    .from(comment).where(and(...conds)).orderBy(desc(comment.createdAt))
}

export async function createComment(data: any) {
  const [row] = await db.insert(comment).values(data).returning()
  return row
}

// ─── History ──────────────────────────────────────────────────────────────

export async function createHistory(data: any) {
  await db.insert(ticketHistory).values(data)
}

export async function findHistory(ticketId: number) {
  return db
    .select({
      id: ticketHistory.id, ticketId: ticketHistory.ticketId, userId: ticketHistory.userId,
      action: ticketHistory.action, oldValue: ticketHistory.oldValue,
      newValue: ticketHistory.newValue, createdAt: ticketHistory.createdAt,
    })
    .from(ticketHistory)
    .where(eq(ticketHistory.ticketId, ticketId))
    .orderBy(desc(ticketHistory.createdAt))
}

// ─── Attachments (count) ──────────────────────────────────────────────────

export async function attachmentCounts(ticketIds: number[]) {
  if (ticketIds.length === 0) return []
  return db
    .select({ ticketId: attachment.ticketId, count: count().as('count') })
    .from(attachment)
    .where(inArray(attachment.ticketId, ticketIds))
    .groupBy(attachment.ticketId)
}

// ─── Time Log ─────────────────────────────────────────────────────────────

export async function findTimeLogById(id: number) {
  const [row] = await db
    .select({
      id: timeLog.id, ticketId: timeLog.ticketId, userId: timeLog.userId,
      description: timeLog.description, startTime: timeLog.startTime,
      endTime: timeLog.endTime, durationMinutes: timeLog.durationMinutes,
      isBillable: timeLog.isBillable, createdAt: timeLog.createdAt, updatedAt: timeLog.updatedAt,
    })
    .from(timeLog).where(eq(timeLog.id, id)).limit(1)
  return row ?? null
}

export async function createTimeLog(data: any) {
  const [row] = await db.insert(timeLog).values(data).returning()
  return row
}

export async function updateTimeLog(id: number, data: Record<string, unknown>) {
  const [row] = await db.update(timeLog).set(data).where(eq(timeLog.id, id)).returning()
  return row
}

export async function sumDurationByUserIds(userIds: string[], since: Date, until: Date) {
  return db
    .select({ userId: timeLog.userId, total: sum(timeLog.durationMinutes) })
    .from(timeLog)
    .where(and(inArray(timeLog.userId, userIds), gte(timeLog.startTime, since), lte(timeLog.startTime, until), isNotNull(timeLog.endTime)))
    .groupBy(timeLog.userId)
}

export async function totalLoggedMinutes() {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${timeLog.durationMinutes}), 0)::int` })
    .from(timeLog)
    .where(isNotNull(timeLog.endTime))
  return Number(row?.total) || 0
}

export async function sumDurationByUser(userId: string) {
  const [row] = await db
    .select({ total: sum(timeLog.durationMinutes) })
    .from(timeLog)
    .where(eq(timeLog.userId, userId))
  return Number(row?.total) || 0
}

