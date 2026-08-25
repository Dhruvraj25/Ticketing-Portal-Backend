import { db } from '../../config/db'
import { project, ticket, module as moduleTable, user } from '../../models/schema'
import { and, eq, desc, lte, gte, count, isNotNull, sql, inArray } from 'drizzle-orm'
import { TicketStatus as TS } from '../../types/index'
import type { ReportFilters, ReportResult } from './types'
import { getDateRange } from './utils'

export async function getProjectSummaryReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const conditions: any[] = []
  if (filters.clientId) conditions.push(eq(project.clientId, filters.clientId))
  if (currentUser.role === 'client') conditions.push(eq(project.clientId, currentUser.id))
  const projects = await db
    .select({
      id: project.id,
      projectName: project.projectName,
      projectCode: project.projectCode,
      status: project.status,
      clientId: project.clientId,
      createdAt: project.createdAt,
    })
    .from(project)
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  if (projects.length === 0) {
    return {
      meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { 'Total Projects': 0, 'Total Tickets': 0 } },
      columns: [{ key: 'projectName', label: 'Project', type: 'text' }, { key: 'projectCode', label: 'Code', type: 'text' }, { key: 'status', label: 'Status', type: 'badge' }, { key: 'ticketCount', label: 'Tickets', type: 'number' }],
      data: [],
    }
  }

  // OPTIMIZED: Single GROUP BY query replaces N+1 per-project ticket count queries
  const projectIds = projects.map(p => p.id)
  const ticketCounts = await db
    .select({ projectId: ticket.projectId, count: count() })
    .from(ticket)
    .where(inArray(ticket.projectId, projectIds))
    .groupBy(ticket.projectId)
  const countMap = new Map(ticketCounts.map(r => [r.projectId, Number(r.count) || 0]))

  const withCounts = projects.map(p => ({
    ...p,
    ticketCount: countMap.get(p.id) || 0,
  }))

  return {
    meta: { totalRecords: withCounts.length, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { 'Total Projects': withCounts.length, 'Total Tickets': withCounts.reduce((s, p) => s + p.ticketCount, 0) } },
    columns: [{ key: 'projectName', label: 'Project', type: 'text' }, { key: 'projectCode', label: 'Code', type: 'text' }, { key: 'status', label: 'Status', type: 'badge' }, { key: 'ticketCount', label: 'Tickets', type: 'number' }],
    data: withCounts.map(p => ({ projectName: p.projectName, projectCode: p.projectCode, status: p.status, ticketCount: p.ticketCount })),
    charts: [{ type: 'pie', title: 'Projects by Status', data: (() => { const c: Record<string, number> = {}; for (const p of withCounts) c[p.status] = (c[p.status] || 0) + 1; return Object.entries(c).map(([n, v]) => ({ name: n.replace(/_/g, ' '), value: v })) })() }],
  }
}

export async function getProjectProgressReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const conditions: any[] = [eq(project.status, 'active')]
  if (currentUser.role === 'client') conditions.push(eq(project.clientId, currentUser.id))
  if (filters.clientId) conditions.push(eq(project.clientId, filters.clientId))

  const projects = await db
    .select({
      id: project.id,
      projectName: project.projectName,
      projectCode: project.projectCode,
    })
    .from(project)
    .where(and(...conditions))

  if (projects.length === 0) {
    return {
      meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: ['Active projects'], summary: { 'Active Projects': 0, 'Avg Progress': '0%' } },
      columns: [{ key: 'projectName', label: 'Project', type: 'text' }, { key: 'projectCode', label: 'Code', type: 'text' }, { key: 'totalTickets', label: 'Total Tickets', type: 'number' }, { key: 'closedTickets', label: 'Closed', type: 'number' }, { key: 'progressPct', label: 'Progress %', type: 'number' }],
      data: [],
    }
  }

  // OPTIMIZED: Single GROUP BY query with FILTER replaces N+1 per-project ticket status fetches
  const projectIds = projects.map(p => p.id)
  const ticketStats = await db
    .select({
      projectId: ticket.projectId,
      total: count().mapWith(Number),
      closed: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = ${TS.CLOSED})::int`.mapWith(Number),
    })
    .from(ticket)
    .where(inArray(ticket.projectId, projectIds))
    .groupBy(ticket.projectId)

  const statsMap = new Map(ticketStats.map(r => [r.projectId, { total: r.total, closed: r.closed }]))

  const withProgress = projects.map(p => {
    const stats = statsMap.get(p.id) || { total: 0, closed: 0 }
    const progress = stats.total > 0 ? Math.round((stats.closed / stats.total) * 100) : 0
    return { projectName: p.projectName, projectCode: p.projectCode, totalTickets: stats.total, closedTickets: stats.closed, progressPct: progress }
  })

  return {
    meta: { totalRecords: withProgress.length, generatedAt: new Date().toISOString(), appliedFilters: ['Active projects'], summary: { 'Active Projects': withProgress.length, 'Avg Progress': `${Math.round(withProgress.reduce((s, p) => s + p.progressPct, 0) / (withProgress.length || 1))}%` } },
    columns: [{ key: 'projectName', label: 'Project', type: 'text' }, { key: 'projectCode', label: 'Code', type: 'text' }, { key: 'totalTickets', label: 'Total Tickets', type: 'number' }, { key: 'closedTickets', label: 'Closed', type: 'number' }, { key: 'progressPct', label: 'Progress %', type: 'number' }],
    data: withProgress,
    charts: [{ type: 'bar', title: 'Project Progress', data: withProgress.map(p => ({ name: p.projectCode, value: p.progressPct })) }],
  }
}

export async function getModuleReportMain(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const conditions: any[] = []
  if (filters.projectId) conditions.push(eq(moduleTable.projectId, filters.projectId))
  const modules = await db
    .select({
      id: moduleTable.id,
      moduleName: moduleTable.moduleName,
      projectId: moduleTable.projectId,
      status: moduleTable.status,
    })
    .from(moduleTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  if (modules.length === 0) {
    return {
      meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { 'Total Modules': 0, 'Total Tickets': 0 } },
      columns: [{ key: 'moduleName', label: 'Module', type: 'text' }, { key: 'status', label: 'Status', type: 'badge' }, { key: 'ticketCount', label: 'Tickets', type: 'number' }, { key: 'closedCount', label: 'Closed', type: 'number' }],
      data: [],
    }
  }

  // OPTIMIZED: Single GROUP BY query with FILTER replaces N+1 per-module ticket status fetches
  const moduleIds = modules.map(m => m.id)
  const ticketStats = await db
    .select({
      moduleId: ticket.moduleId,
      total: count().mapWith(Number),
      closed: sql<number>`COUNT(*) FILTER (WHERE ${ticket.status} = ${TS.CLOSED})::int`.mapWith(Number),
    })
    .from(ticket)
    .where(inArray(ticket.moduleId, moduleIds))
    .groupBy(ticket.moduleId)

  const statsMap = new Map(ticketStats.map(r => [r.moduleId, { total: r.total, closed: r.closed }]))

  const withStats = modules.map(m => {
    const stats = statsMap.get(m.id) || { total: 0, closed: 0 }
    return { moduleName: m.moduleName, projectId: m.projectId, status: m.status, ticketCount: stats.total, closedCount: stats.closed }
  })

  return {
    meta: { totalRecords: withStats.length, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { 'Total Modules': withStats.length, 'Total Tickets': withStats.reduce((s, m) => s + m.ticketCount, 0) } },
    columns: [{ key: 'moduleName', label: 'Module', type: 'text' }, { key: 'status', label: 'Status', type: 'badge' }, { key: 'ticketCount', label: 'Tickets', type: 'number' }, { key: 'closedCount', label: 'Closed', type: 'number' }],
    data: withStats,
  }
}

export async function getClientProjectReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  let clientIds: string[] | undefined
  if (currentUser.role === 'client') clientIds = [currentUser.id]
  else if (filters.clientId) clientIds = [filters.clientId]

  const clientsQuery = clientIds
    ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(and(eq(user.role, 'client'), inArray(user.id, clientIds)))
    : await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.role, 'client'))

  if (clientsQuery.length === 0) {
    return {
      meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: [], summary: { Clients: 0, 'Total Projects': 0 } },
      columns: [{ key: 'clientName', label: 'Client', type: 'text' }, { key: 'clientEmail', label: 'Email', type: 'text' }, { key: 'projectCount', label: 'Projects', type: 'number' }, { key: 'ticketCount', label: 'Tickets', type: 'number' }],
      data: [],
    }
  }

  const allClientIds = clientsQuery.map(c => c.id)

  // OPTIMIZED: Two GROUP BY queries replace deeply nested N+1 (clients → projects → tickets)
  const [projectCounts, ticketCountsPerProject] = await Promise.all([
    // Count projects per client
    db
      .select({ clientId: project.clientId, count: count() })
      .from(project)
      .where(inArray(project.clientId, allClientIds))
      .groupBy(project.clientId),
    // Count tickets per project
    db
      .select({ projectId: ticket.projectId, clientId: project.clientId, count: count() })
      .from(ticket)
      .innerJoin(project, eq(ticket.projectId, project.id))
      .where(inArray(project.clientId, allClientIds))
      .groupBy(ticket.projectId, project.clientId),
  ])

  const projectCountMap = new Map(projectCounts.map(r => [r.clientId, Number(r.count) || 0]))
  const ticketCountMap = new Map<string, number>()
  for (const r of ticketCountsPerProject) {
    ticketCountMap.set(r.clientId, (ticketCountMap.get(r.clientId) || 0) + Number(r.count))
  }

  const withProjects = clientsQuery.map(c => ({
    clientName: c.name,
    clientEmail: c.email,
    projectCount: projectCountMap.get(c.id) || 0,
    ticketCount: ticketCountMap.get(c.id) || 0,
  }))

  return {
    meta: { totalRecords: withProjects.length, generatedAt: new Date().toISOString(), appliedFilters: [], summary: { Clients: withProjects.length, 'Total Projects': withProjects.reduce((s, c) => s + c.projectCount, 0) } },
    columns: [{ key: 'clientName', label: 'Client', type: 'text' }, { key: 'clientEmail', label: 'Email', type: 'text' }, { key: 'projectCount', label: 'Projects', type: 'number' }, { key: 'ticketCount', label: 'Tickets', type: 'number' }],
    data: withProjects,
    charts: [{ type: 'bar', title: 'Projects per Client', data: withProjects.map(c => ({ name: c.clientName, value: c.projectCount })) }],
  }
}
