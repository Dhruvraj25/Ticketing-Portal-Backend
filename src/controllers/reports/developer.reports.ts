import { db } from '../../config/db'
import { ticket, timeLog, user } from '../../models/schema'
import { and, eq, desc, lte, gte, count, isNotNull, sql, inArray, sum } from 'drizzle-orm'
import { TicketStatus as TS } from '../../types/index'
import type { ReportFilters, ReportResult } from './types'
import { getDateRange } from './utils'

export async function getDeveloperProductivityReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  let developers = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.role, 'developer'))
  if (filters.developerId) developers = developers.filter(d => d.id === filters.developerId)
  if (developers.length === 0) return { meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: [], summary: {} }, columns: [], data: [] }

  const devIds = developers.map(d => d.id)
  const [timeResults, assignedResults, resolvedResults] = await Promise.all([
    db.select({ userId: timeLog.userId, total: sum(timeLog.durationMinutes) }).from(timeLog).where(and(inArray(timeLog.userId, devIds), gte(timeLog.startTime, since), lte(timeLog.startTime, until), isNotNull(timeLog.endTime))).groupBy(timeLog.userId),
    db.select({ assignedToId: ticket.assignedToId, count: count() }).from(ticket).where(and(inArray(ticket.assignedToId, devIds), gte(ticket.createdAt, since))).groupBy(ticket.assignedToId),
    db.select({ assignedToId: ticket.assignedToId, count: count() }).from(ticket).where(and(inArray(ticket.assignedToId, devIds), eq(ticket.status, TS.CLOSED), gte(ticket.createdAt, since))).groupBy(ticket.assignedToId),
  ])

  const timeMap = new Map(timeResults.map(r => [r.userId, Number(r.total) || 0]))
  const assignedMap = new Map(assignedResults.map(r => [r.assignedToId, Number(r.count) || 0]))
  const resolvedMap = new Map(resolvedResults.map(r => [r.assignedToId, Number(r.count) || 0]))

  const stats = developers.map(dev => ({
    name: dev.name, email: dev.email,
    totalHours: Math.round(((timeMap.get(dev.id) || 0) / 60) * 10) / 10,
    ticketsAssigned: assignedMap.get(dev.id) || 0,
    ticketsResolved: resolvedMap.get(dev.id) || 0,
    avgHoursPerTicket: (assignedMap.get(dev.id) || 0) > 0 ? Math.round(((timeMap.get(dev.id) || 0) / 60) / (assignedMap.get(dev.id) || 1) * 10) / 10 : 0,
  }))

  return {
    meta: { totalRecords: stats.length, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { Developers: stats.length, 'Total Hours': `${stats.reduce((s, d) => s + d.totalHours, 0)}h`, 'Total Resolved': stats.reduce((s, d) => s + d.ticketsResolved, 0) } },
    columns: [{ key: 'name', label: 'Developer', type: 'text' }, { key: 'totalHours', label: 'Hours Logged', type: 'number' }, { key: 'ticketsAssigned', label: 'Assigned', type: 'number' }, { key: 'ticketsResolved', label: 'Resolved', type: 'number' }, { key: 'avgHoursPerTicket', label: 'Avg Hours/Ticket', type: 'number' }],
    data: stats,
    charts: [{ type: 'bar', title: 'Hours per Developer', data: stats.map(d => ({ name: d.name, value: d.totalHours })) }, { type: 'bar', title: 'Tickets Resolved', data: stats.map(d => ({ name: d.name, value: d.ticketsResolved })) }],
  }
}

export async function getDeveloperWorkloadReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  let developers = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.role, 'developer'))
  if (filters.developerId) developers = developers.filter(d => d.id === filters.developerId)
  if (developers.length === 0) return { meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: ['Current workload'], summary: {} }, columns: [], data: [] }

  const devIds = developers.map(d => d.id)
  const ticketCounts = await db.select({ assignedToId: ticket.assignedToId, status: ticket.status, count: count() }).from(ticket).where(and(inArray(ticket.assignedToId, devIds), sql`${ticket.status} != ${TS.CLOSED}`)).groupBy(ticket.assignedToId, ticket.status)

  const openMap = new Map<string, number>()
  const inProgressMap = new Map<string, number>()
  const activeMap = new Map<string, number>()
  for (const row of ticketCounts) {
    if (!row.assignedToId) continue
    const c = Number(row.count) || 0
    activeMap.set(row.assignedToId, (activeMap.get(row.assignedToId) || 0) + c)
    if (row.status === TS.NEW || row.status === TS.MANAGER_REVIEW) openMap.set(row.assignedToId, c)
    if (row.status === TS.IN_PROGRESS) inProgressMap.set(row.assignedToId, c)
  }

  const stats = developers.map(dev => ({ name: dev.name, activeTickets: activeMap.get(dev.id) || 0, openTickets: openMap.get(dev.id) || 0, inProgressTickets: inProgressMap.get(dev.id) || 0 }))
  return {
    meta: { totalRecords: stats.length, generatedAt: new Date().toISOString(), appliedFilters: ['Current workload'], summary: { Developers: stats.length, 'Active Tickets': stats.reduce((s, d) => s + d.activeTickets, 0) } },
    columns: [{ key: 'name', label: 'Developer', type: 'text' }, { key: 'activeTickets', label: 'Active Tickets', type: 'number' }, { key: 'openTickets', label: 'Open', type: 'number' }, { key: 'inProgressTickets', label: 'Work in Progress', type: 'number' }],
    data: stats,
    charts: [{ type: 'bar', title: 'Developer Workload', data: stats.map(d => ({ name: d.name, value: d.activeTickets })) }],
  }
}

export async function getWorklogReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions: any[] = [gte(timeLog.startTime, since), lte(timeLog.startTime, until), isNotNull(timeLog.endTime)]
  if (filters.developerId) conditions.push(eq(timeLog.userId, filters.developerId))

  // OPTIMIZED: Select only needed columns instead of SELECT *
  const logs = await db
    .select({
      id: timeLog.id,
      userId: timeLog.userId,
      ticketId: timeLog.ticketId,
      durationMinutes: timeLog.durationMinutes,
      isBillable: timeLog.isBillable,
      startTime: timeLog.startTime,
    })
    .from(timeLog)
    .where(and(...conditions))
    .orderBy(desc(timeLog.startTime))
    .limit(500)

  const userIds = [...new Set(logs.map(l => l.userId))]
  const usersData = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds))
  const userMap = new Map(usersData.map(u => [u.id, u.name]))

  const { ticket: ticketTbl } = await import('../../models/schema')
  const ticketIds = [...new Set(logs.map(l => l.ticketId))]
  const ticketsData = await db.select({ id: ticketTbl.id, ticketNumber: ticketTbl.ticketNumber }).from(ticketTbl).where(inArray(ticketTbl.id, ticketIds))
  const ticketMap = new Map(ticketsData.map(t => [t.id, t.ticketNumber]))

  const totalMinutes = logs.reduce((s, l) => s + (l.durationMinutes || 0), 0)
  const billableMinutes = logs.filter(l => l.isBillable).reduce((s, l) => s + (l.durationMinutes || 0), 0)

  return {
    meta: { totalRecords: logs.length, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { 'Total Entries': logs.length, 'Total Hours': `${Math.round(totalMinutes / 60 * 10) / 10}h`, 'Billable Hours': `${Math.round(billableMinutes / 60 * 10) / 10}h` } },
    columns: [{ key: 'userName', label: 'User', type: 'text' }, { key: 'ticketNumber', label: 'Ticket', type: 'text' }, { key: 'durationMinutes', label: 'Minutes', type: 'number' }, { key: 'isBillable', label: 'Billable', type: 'badge' }, { key: 'startTime', label: 'Date', type: 'date' }],
    data: logs.map(l => ({ userName: userMap.get(l.userId) || 'Unknown', ticketNumber: ticketMap.get(l.ticketId) || `#${l.ticketId}`, durationMinutes: l.durationMinutes || 0, isBillable: l.isBillable ? 'Yes' : 'No', startTime: l.startTime.toISOString() })),
  }
}

export async function getBillableHoursReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions: any[] = [eq(timeLog.isBillable, true), gte(timeLog.startTime, since), lte(timeLog.startTime, until), isNotNull(timeLog.endTime)]
  if (filters.developerId) conditions.push(eq(timeLog.userId, filters.developerId))

  // OPTIMIZED: Select only needed columns
  const logs = await db
    .select({
      durationMinutes: timeLog.durationMinutes,
      startTime: timeLog.startTime,
    })
    .from(timeLog)
    .where(and(...conditions))
    .orderBy(desc(timeLog.startTime))
    .limit(500)

  const totalMinutes = logs.reduce((s, l) => s + (l.durationMinutes || 0), 0)
  return { meta: { totalRecords: logs.length, generatedAt: new Date().toISOString(), appliedFilters: ['Billable only'], summary: { 'Total Entries': logs.length, 'Billable Hours': `${Math.round(totalMinutes / 60 * 10) / 10}h` } }, columns: [{ key: 'durationMinutes', label: 'Minutes', type: 'number' }, { key: 'startTime', label: 'Date', type: 'date' }], data: logs.map(l => ({ durationMinutes: l.durationMinutes || 0, startTime: l.startTime.toISOString() })) }
}

export async function getNonBillableHoursReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions: any[] = [eq(timeLog.isBillable, false), gte(timeLog.startTime, since), lte(timeLog.startTime, until), isNotNull(timeLog.endTime)]
  if (filters.developerId) conditions.push(eq(timeLog.userId, filters.developerId))

  // OPTIMIZED: Select only needed columns
  const logs = await db
    .select({
      durationMinutes: timeLog.durationMinutes,
      startTime: timeLog.startTime,
    })
    .from(timeLog)
    .where(and(...conditions))
    .orderBy(desc(timeLog.startTime))
    .limit(500)

  const totalMinutes = logs.reduce((s, l) => s + (l.durationMinutes || 0), 0)
  return { meta: { totalRecords: logs.length, generatedAt: new Date().toISOString(), appliedFilters: ['Non-billable only'], summary: { 'Total Entries': logs.length, 'Non-Billable Hours': `${Math.round(totalMinutes / 60 * 10) / 10}h` } }, columns: [{ key: 'durationMinutes', label: 'Minutes', type: 'number' }, { key: 'startTime', label: 'Date', type: 'date' }], data: logs.map(l => ({ durationMinutes: l.durationMinutes || 0, startTime: l.startTime.toISOString() })) }
}

export async function getTeamPerformanceReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const allUsers = await db.select({ id: user.id, name: user.name, role: user.role }).from(user).where(inArray(user.role, ['developer', 'project_manager']))
  if (allUsers.length === 0) return { meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: ['All active members'], summary: {} }, columns: [], data: [] }

  const userIds = allUsers.map(u => u.id)
  const [timeResults, resolvedResults] = await Promise.all([
    db.select({ userId: timeLog.userId, total: sum(timeLog.durationMinutes) }).from(timeLog).where(and(inArray(timeLog.userId, userIds), gte(timeLog.startTime, since), lte(timeLog.startTime, until), isNotNull(timeLog.endTime))).groupBy(timeLog.userId),
    db.select({ assignedToId: ticket.assignedToId, count: count() }).from(ticket).where(and(inArray(ticket.assignedToId, userIds), eq(ticket.status, TS.CLOSED), gte(ticket.createdAt, since))).groupBy(ticket.assignedToId),
  ])

  const timeMap = new Map(timeResults.map(r => [r.userId, Number(r.total) || 0]))
  const resolvedMap = new Map(resolvedResults.map(r => [r.assignedToId, Number(r.count) || 0]))
  const stats = allUsers.map(u => ({ name: u.name, role: u.role, totalHours: Math.round(((timeMap.get(u.id) || 0) / 60) * 10) / 10, ticketsResolved: resolvedMap.get(u.id) || 0 }))
  return {
    meta: { totalRecords: stats.length, generatedAt: new Date().toISOString(), appliedFilters: ['All active members'], summary: { Members: stats.length, 'Total Hours': `${stats.reduce((s, u) => s + u.totalHours, 0)}h`, 'Total Resolved': stats.reduce((s, u) => s + u.ticketsResolved, 0) } },
    columns: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'role', label: 'Role', type: 'text' }, { key: 'totalHours', label: 'Hours', type: 'number' }, { key: 'ticketsResolved', label: 'Resolved', type: 'number' }],
    data: stats,
    charts: [{ type: 'bar', title: 'Hours by Member', data: stats.map(u => ({ name: u.name, value: u.totalHours })) }],
  }
}
import type { UserRole } from '../../types/index'

