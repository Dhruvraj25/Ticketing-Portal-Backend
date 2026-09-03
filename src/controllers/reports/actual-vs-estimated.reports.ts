// ============================================================================
// Actual vs Estimated Time Report
// ============================================================================
// Compares estimated hours (ticket.estimatedHours) against actual logged hours
// (time_log.durationMinutes) per ticket/task.
//
// Dimensions supported via filters: Developer, Date, Project, Task.
// Returns per-ticket rows with:
//   estimatedHours, actualHours, variance (actual − estimated),
//   variancePct (variance / estimated × 100)
//
// Actual hours reuse the existing worklog data (time_log) — no duplicate time
// calculation exists elsewhere; this report aggregates the same source.
// ============================================================================

import { db } from '../../config/db'
import { ticket, timeLog, user, project as projectTable } from '../../models/schema'
import { and, eq, gte, lte, isNotNull, sum, inArray, sql } from 'drizzle-orm'
import type { ReportFilters, ReportResult } from './types'
import { getDateRange } from './utils'

export async function getActualVsEstimatedReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  // Internal report — clients are not allowed (it exposes worklog data).
  if (currentUser.role === 'client') {
    throw new Error('Access denied to this report')
  }

  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const conditions: any[] = [gte(ticket.createdAt, since), lte(ticket.createdAt, until)]

  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))
  if (filters.moduleId) conditions.push(eq(ticket.moduleId, filters.moduleId))
  if (filters.developerId) conditions.push(eq(ticket.assignedToId, filters.developerId))
  if (filters.clientId) conditions.push(eq(ticket.clientId, filters.clientId))
  if (filters.status) conditions.push(eq(ticket.status, filters.status))

  // Developers can only see their own tickets; managers/admins see all.
  if (currentUser.role === 'developer') {
    conditions.push(eq(ticket.assignedToId, currentUser.id))
  }

  // Estimated hours per ticket (task dimension).
  const ticketRows = await db
    .select({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
      projectId: ticket.projectId,
      assignedToId: ticket.assignedToId,
      estimatedHours: ticket.estimatedHours,
      createdAt: ticket.createdAt,
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(ticket.createdAt)

  if (ticketRows.length === 0) {
    return {
      meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: [], summary: {} },
      columns: [],
      data: [],
    }
  }

  const ticketIds = ticketRows.map(t => t.id)
  const projectIds = [...new Set(ticketRows.map(t => t.projectId).filter((p): p is number => p != null))]
  const devIds = [...new Set(ticketRows.map(t => t.assignedToId).filter((d): d is string => d != null))]

  // Actual hours from existing worklogs (single aggregation, no duplicate math).
  const [actualResults, projectResults, devResults] = await Promise.all([
    db
      .select({ ticketId: timeLog.ticketId, totalMinutes: sum(timeLog.durationMinutes) })
      .from(timeLog)
      .where(and(inArray(timeLog.ticketId, ticketIds), isNotNull(timeLog.endTime)))
      .groupBy(timeLog.ticketId),
    projectIds.length > 0
      ? db.select({ id: projectTable.id, projectName: projectTable.projectName }).from(projectTable).where(inArray(projectTable.id, projectIds))
      : Promise.resolve([]),
    devIds.length > 0
      ? db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, devIds))
      : Promise.resolve([]),
  ])

  const actualMap = new Map(actualResults.map(r => [r.ticketId, Number(r.totalMinutes) || 0]))
  const projectMap = new Map(projectResults.map(p => [p.id, p.projectName]))
  const devMap = new Map(devResults.map(d => [d.id, d.name]))

  const rows = ticketRows.map(t => {
    const estimated = t.estimatedHours != null ? Number(t.estimatedHours) : 0
    const actual = Math.round((actualMap.get(t.id) || 0) / 60 * 100) / 100
    const variance = Math.round((actual - estimated) * 100) / 100
    const variancePct = estimated > 0 ? Math.round((variance / estimated) * 1000) / 10 : 0

    return {
      ticketNumber: t.ticketNumber,
      title: t.title,
      status: t.status,
      projectName: t.projectId != null ? (projectMap.get(t.projectId) || '—') : '—',
      developerName: t.assignedToId != null ? (devMap.get(t.assignedToId) || '—') : '—',
      createdDate: t.createdAt.toISOString().split('T')[0],
      estimatedHours: estimated,
      actualHours: actual,
      variance,
      variancePct,
    }
  })

  const totalEstimated = rows.reduce((s, r) => s + r.estimatedHours, 0)
  const totalActual = rows.reduce((s, r) => s + r.actualHours, 0)
  const totalVariance = Math.round((totalActual - totalEstimated) * 100) / 100
  const totalVariancePct = totalEstimated > 0 ? Math.round((totalVariance / totalEstimated) * 1000) / 10 : 0

  return {
    meta: {
      totalRecords: rows.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: {
        'Estimated Hours': `${totalEstimated}h`,
        'Actual Hours': `${totalActual}h`,
        'Variance': `${totalVariance > 0 ? '+' : ''}${totalVariance}h`,
        'Variance %': `${totalVariancePct}%`,
      },
    },
    columns: [
      { key: 'ticketNumber', label: 'Ticket', type: 'text' },
      { key: 'title', label: 'Task', type: 'text' },
      { key: 'developerName', label: 'Developer', type: 'text' },
      { key: 'projectName', label: 'Project', type: 'text' },
      { key: 'createdDate', label: 'Date', type: 'date' },
      { key: 'estimatedHours', label: 'Estimated (h)', type: 'number' },
      { key: 'actualHours', label: 'Actual (h)', type: 'number' },
      { key: 'variance', label: 'Variance (h)', type: 'number' },
      { key: 'variancePct', label: 'Variance %', type: 'number' },
    ],
    data: rows,
    charts: [
      {
        type: 'bar',
        title: 'Estimated vs Actual Hours',
        data: [
          { name: 'Estimated', value: totalEstimated },
          { name: 'Actual', value: totalActual },
        ],
      },
    ],
  }
}