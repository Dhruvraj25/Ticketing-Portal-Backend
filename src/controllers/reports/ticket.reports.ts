import { db } from '../../config/db'
import { ticket, timeLog } from '../../models/schema'
import { and, eq, desc, lte, gte, count, isNotNull, sql, inArray } from 'drizzle-orm'
import { TicketStatus as TS, TICKET_STATUS_CONFIG } from '../../types/index'
import type { ReportFilters, ReportResult } from './types'
import { getDateRange } from './utils'

export async function getTicketSummaryReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions: any[] = [gte(ticket.createdAt, since), lte(ticket.createdAt, until)]
  if (currentUser.role === 'client') conditions.push(eq(ticket.clientId, currentUser.id))
  if (currentUser.role === 'developer') conditions.push(eq(ticket.assignedToId, currentUser.id))
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))
  if (filters.moduleId) conditions.push(eq(ticket.moduleId, filters.moduleId))
  if (filters.developerId) conditions.push(eq(ticket.assignedToId, filters.developerId))
  if (filters.clientId) conditions.push(eq(ticket.clientId, filters.clientId))
  if (filters.status) conditions.push(eq(ticket.status, filters.status))
  if (filters.priority) conditions.push(eq(ticket.priority, filters.priority))

  // OPTIMIZED: Single scan with COUNT(*) OVER() window function + SQL FILTER for status counts
  // Before: 2 separate scans (one for counts, one for data) + JS .filter()
  // After:  1 scan computes both the status counts (via FILTER) and the data rows
  const rows = await db
    .select({
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      totalCount: sql<number>`COUNT(*) OVER()::int`.mapWith(Number),
      openCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} IN ('new', 'manager_review', 'assigned')) OVER()::int`.mapWith(Number),
      inProgressCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} IN ('in_progress', 'estimate_pending', 'estimate_approved')) OVER()::int`.mapWith(Number),
      resolvedCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} IN ('resolved', 'client_review')) OVER()::int`.mapWith(Number),
      closedCount: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = 'closed') OVER()::int`.mapWith(Number),
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(desc(ticket.createdAt))

  const c = rows.length > 0
    ? { total: rows[0].totalCount, openCount: rows[0].openCount, inProgressCount: rows[0].inProgressCount, resolvedCount: rows[0].resolvedCount, closedCount: rows[0].closedCount }
    : { total: 0, openCount: 0, inProgressCount: 0, resolvedCount: 0, closedCount: 0 }

  return {
    meta: {
      totalRecords: c.total,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: { 'Total Tickets': c.total, Open: c.openCount, 'Work in Progress': c.inProgressCount, 'Ready for Client Review': c.resolvedCount, Completed: c.closedCount },
    },
    columns: [
      { key: 'ticketNumber', label: 'Ticket', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'status', label: 'Status', type: 'badge' },
      { key: 'priority', label: 'Priority', type: 'badge' },
      { key: 'createdAt', label: 'Created', type: 'date' },
    ],
    data: rows.map(r => ({ ticketNumber: r.ticketNumber, title: r.title, status: r.status, priority: r.priority, createdAt: r.createdAt.toISOString() })),
    charts: [{ type: 'pie', title: 'Tickets by Status', data: [{ name: 'Open', value: c.openCount }, { name: 'Work in Progress', value: c.inProgressCount }, { name: 'Ready for Client Review', value: c.resolvedCount }, { name: 'Completed', value: c.closedCount }] }],
  }
}

export async function getTicketStatusReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions: any[] = [gte(ticket.createdAt, since), lte(ticket.createdAt, until)]
  if (currentUser.role === 'client') conditions.push(eq(ticket.clientId, currentUser.id))
  if (currentUser.role === 'developer') conditions.push(eq(ticket.assignedToId, currentUser.id))
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))
  if (filters.developerId) conditions.push(eq(ticket.assignedToId, filters.developerId))
  if (filters.clientId) conditions.push(eq(ticket.clientId, filters.clientId))

  // OPTIMIZED: GROUP BY in SQL instead of SELECT * + JS reduce
  const rows = await db
    .select({ status: ticket.status, count: count() })
    .from(ticket)
    .where(and(...conditions))
    .groupBy(ticket.status)

  const statusCounts: Record<string, number> = {}
  let total = 0
  for (const r of rows) {
    const c = Number(r.count) || 0
    statusCounts[r.status] = c
    total += c
  }

  return {
    meta: {
      totalRecords: total, generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: Object.fromEntries(Object.entries(statusCounts).map(([k, v]) => [(TICKET_STATUS_CONFIG as any)[k]?.label || k.replace(/_/g, ' '), v])),
    },
    columns: [{ key: 'status', label: 'Status', type: 'badge' }, { key: 'count', label: 'Count', type: 'number' }],
    data: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
    charts: [{ type: 'bar', title: 'Status Distribution', data: Object.entries(statusCounts).map(([name, value]) => ({ name: (TICKET_STATUS_CONFIG as any)[name]?.label || name.replace(/_/g, ' '), value })) }],
  }
}

export async function getTicketAgingReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const conditions: any[] = [sql`${ticket.status} NOT IN (${TS.CLOSED})`]
  if (currentUser.role === 'client') conditions.push(eq(ticket.clientId, currentUser.id))
  if (currentUser.role === 'developer') conditions.push(eq(ticket.assignedToId, currentUser.id))
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))

  const rows = await db
    .select({
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
      createdAt: ticket.createdAt,
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(ticket.createdAt)

  const now = Date.now()
  const aged = rows.map(r => ({ ...r, daysOld: Math.floor((now - r.createdAt.getTime()) / (1000 * 60 * 60 * 24)) })).filter(r => r.daysOld > 1)
  const agingBuckets = { '1-7 days': 0, '8-14 days': 0, '15-30 days': 0, '30+ days': 0 }
  for (const r of aged) {
    if (r.daysOld <= 7) agingBuckets['1-7 days']++
    else if (r.daysOld <= 14) agingBuckets['8-14 days']++
    else if (r.daysOld <= 30) agingBuckets['15-30 days']++
    else agingBuckets['30+ days']++
  }

  return {
    meta: { totalRecords: aged.length, generatedAt: new Date().toISOString(), appliedFilters: ['Open/In Progress tickets only'], summary: agingBuckets },
    columns: [{ key: 'ticketNumber', label: 'Ticket', type: 'text' }, { key: 'title', label: 'Title', type: 'text' }, { key: 'status', label: 'Status', type: 'badge' }, { key: 'daysOld', label: 'Days Open', type: 'number' }, { key: 'createdAt', label: 'Created', type: 'date' }],
    data: aged.slice(0, 100).map(r => ({ ticketNumber: r.ticketNumber, title: r.title, status: r.status, daysOld: r.daysOld, createdAt: r.createdAt.toISOString() })),
    charts: [{ type: 'bar', title: 'Aging Distribution', data: Object.entries(agingBuckets).map(([name, value]) => ({ name, value })) }],
  }
}

export async function getTicketResolutionReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const conditions: any[] = [isNotNull(ticket.resolvedAt)]
  if (currentUser.role === 'client') conditions.push(eq(ticket.clientId, currentUser.id))
  if (currentUser.role === 'developer') conditions.push(eq(ticket.assignedToId, currentUser.id))
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))
  if (filters.developerId) conditions.push(eq(ticket.assignedToId, filters.developerId))

  const rows = await db
    .select({
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt,
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(desc(ticket.resolvedAt))

  const withHours = rows.map(r => ({
    ticketNumber: r.ticketNumber,
    title: r.title,
    resolutionHours: r.resolvedAt ? Math.round((r.resolvedAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60) * 10) / 10 : 0,
    resolvedAt: r.resolvedAt,
  }))
  const avgHours = withHours.length ? Math.round(withHours.reduce((s, r) => s + r.resolutionHours, 0) / withHours.length * 10) / 10 : 0

  return {
    meta: { totalRecords: withHours.length, generatedAt: new Date().toISOString(), appliedFilters: ['Resolved tickets only'], summary: { 'Total Resolved': withHours.length, 'Avg Resolution': `${avgHours}h`, Fastest: withHours.length ? `${Math.min(...withHours.map(r => r.resolutionHours))}h` : '—', Slowest: withHours.length ? `${Math.max(...withHours.map(r => r.resolutionHours))}h` : '—' } },
    columns: [{ key: 'ticketNumber', label: 'Ticket', type: 'text' }, { key: 'title', label: 'Title', type: 'text' }, { key: 'resolutionHours', label: 'Hours to Resolve', type: 'number' }, { key: 'resolvedAt', label: 'Resolved', type: 'date' }],
    data: withHours.slice(0, 100).map(r => ({ ticketNumber: r.ticketNumber, title: r.title, resolutionHours: r.resolutionHours, resolvedAt: r.resolvedAt?.toISOString() || '' })),
  }
}
