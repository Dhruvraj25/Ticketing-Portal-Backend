/**
 * Shared utilities for report controllers.
 */

export function getDateRange(dateFrom?: string, dateTo?: string) {
  const since = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const until = dateTo ? new Date(dateTo + 'T23:59:59.999Z') : new Date()
  return { since, until }
}

import type { UserRole, TicketStatus } from '../../types/index'
import type { ReportType } from '../../types/report-types'

export function checkAccess(userRole: UserRole, reportType: ReportType): boolean {
  if (userRole === 'admin') return true

  const managerReports: ReportType[] = [
    'ticket_summary', 'ticket_status', 'ticket_aging', 'ticket_resolution',
    'project_summary', 'project_progress', 'module_report',
    'developer_productivity', 'developer_workload', 'worklog',
    'billable_hours', 'non_billable_hours', 'assignment', 'analytics',
    'team_performance', 'sla_compliance', 'sla_breach',
  ]
  const devReports: ReportType[] = [
    'ticket_summary', 'ticket_status', 'ticket_aging', 'ticket_resolution',
    'developer_productivity', 'developer_workload', 'worklog',
    'billable_hours', 'non_billable_hours',
  ]
  const clientReports: ReportType[] = [
    'ticket_summary', 'ticket_status', 'ticket_aging', 'ticket_resolution',
    'project_summary', 'project_progress', 'client_project',
    'support_wallet', 'wallet_transaction', 'wallet_consumption', 'wallet_history',
  ]
  const walletReports: ReportType[] = [
    'support_wallet', 'wallet_transaction', 'wallet_consumption', 'wallet_history',
  ]
  const estimateReports: ReportType[] = [
    'estimate_approval', 'estimate_additional_hours',
  ]
  const timeTrackingReports: ReportType[] = ['actual_vs_estimated']

  if (userRole === 'project_manager') return [...managerReports, ...walletReports, ...estimateReports, ...timeTrackingReports].includes(reportType)
  if (userRole === 'developer') return [...devReports, ...timeTrackingReports].includes(reportType)
  if (userRole === 'client') return clientReports.includes(reportType)
  return false
}

import { db } from '../../config/db'
import { user } from '../../models/schema'
import { sql } from 'drizzle-orm'

/**
 * Resolve the client-org scoping condition for report queries.
 * Clients see tickets/projects of their entire organization, not just their
 * own rows — while other organizations remain fully isolated.
 */
export async function getClientScopeCondition(clientUserId: string): Promise<{ clientIds: string[] } | null> {
  const [me] = await db
    .select({ id: user.id, role: user.role, accountId: user.accountId })
    .from(user)
    .where(sql`${user.id} = ${clientUserId}`)
    .limit(1)
  if (!me || me.role !== 'client') return null
  if (!me.accountId) return { clientIds: [me.id] }

  const members = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`${user.accountId} = ${me.accountId} AND ${user.role} = 'client'`)
  const ids = members.map(m => m.id)
  if (!ids.includes(me.id)) ids.push(me.id)
  return { clientIds: ids }
}
