import { db } from '../../config/db'
import { ticket } from '../../models/schema'
import { and, eq, desc, isNotNull } from 'drizzle-orm'
import type { ReportFilters, ReportResult } from './types'

export async function getSlaComplianceReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const conditions: any[] = [isNotNull(ticket.resolvedAt)]
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))
  if (filters.developerId) conditions.push(eq(ticket.assignedToId, filters.developerId))

  const rows = await db
    .select({
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt,
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(desc(ticket.resolvedAt))
    .limit(200)

  const slaThresholdHours = 48
  const withSLA = rows.map(r => ({
    ticketNumber: r.ticketNumber,
    resolutionHours: r.resolvedAt ? Math.round((r.resolvedAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60) * 10) / 10 : 0,
    withinSLA: r.resolvedAt ? (r.resolvedAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60) <= slaThresholdHours : false,
  }))
  const withinSLA = withSLA.filter(r => r.withinSLA).length
  const breached = withSLA.length - withinSLA
  const complianceRate = withSLA.length > 0 ? Math.round((withinSLA / withSLA.length) * 100) : 0

  return {
    meta: { totalRecords: withSLA.length, generatedAt: new Date().toISOString(), appliedFilters: ['SLA threshold: 48 hours'], summary: { 'Total Resolved': withSLA.length, 'Within SLA': withinSLA, Breached: breached, 'Compliance Rate': `${complianceRate}%` } },
    columns: [{ key: 'ticketNumber', label: 'Ticket', type: 'text' }, { key: 'resolutionHours', label: 'Hours to Resolve', type: 'number' }, { key: 'withinSLA', label: 'Within SLA', type: 'badge' }],
    data: withSLA.slice(0, 100).map(r => ({ ticketNumber: r.ticketNumber, resolutionHours: r.resolutionHours, withinSLA: r.withinSLA ? 'Yes' : 'No' })),
    charts: [{ type: 'pie', title: 'SLA Compliance', data: [{ name: 'Within SLA', value: withinSLA }, { name: 'Breached', value: breached }] }],
  }
}

export async function getSlaBreachReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const conditions: any[] = [isNotNull(ticket.resolvedAt)]
  if (filters.projectId) conditions.push(eq(ticket.projectId, filters.projectId))
  const rows = await db
    .select({
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt,
    })
    .from(ticket)
    .where(and(...conditions))
    .orderBy(desc(ticket.resolvedAt))
    .limit(200)
  const slaThresholdHours = 48
  const breached = rows
    .map(r => ({
      ticketNumber: r.ticketNumber,
      resolutionHours: r.resolvedAt ? Math.round((r.resolvedAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60) * 10) / 10 : 0,
    }))
    .filter(r => r.resolutionHours > slaThresholdHours)

  return {
    meta: { totalRecords: breached.length, generatedAt: new Date().toISOString(), appliedFilters: ['SLA threshold: 48 hours', 'Breached only'], summary: { 'Breached Tickets': breached.length, 'Avg Override': breached.length ? `${Math.round(breached.reduce((s, r) => s + r.resolutionHours, 0) / breached.length * 10) / 10}h` : '—' } },
    columns: [{ key: 'ticketNumber', label: 'Ticket', type: 'text' }, { key: 'resolutionHours', label: 'Hours', type: 'number' }, { key: 'overSlaBy', label: 'Over by (h)', type: 'number' }],
    data: breached.slice(0, 100).map(r => ({ ticketNumber: r.ticketNumber, resolutionHours: r.resolutionHours, overSlaBy: Math.round((r.resolutionHours - slaThresholdHours) * 10) / 10 })),
  }
}
