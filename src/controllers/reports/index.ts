import { wrapController } from '../../lib/performance-profiler'
import type { ReportType } from '../../types/report-types'
import type { UserRole } from '../../types/index'
import type { ReportFilters, ReportResult } from './types'
import { checkAccess } from './utils'

// Import individual report modules
import * as ticketReports from './ticket.reports'
import * as developerReports from './developer.reports'
import * as projectReports from './project.reports'
import * as slaReports from './sla.reports'
import * as walletReports from './wallet.reports'

type ReportFn = (filters: ReportFilters, currentUser: { id: string; role: string }) => Promise<ReportResult>

const reportRegistry: Record<string, ReportFn> = {
  // Ticket reports
  ticket_summary: ticketReports.getTicketSummaryReport,
  ticket_status: ticketReports.getTicketStatusReport,
  ticket_aging: ticketReports.getTicketAgingReport,
  ticket_resolution: ticketReports.getTicketResolutionReport,

  // Developer reports
  developer_productivity: developerReports.getDeveloperProductivityReport,
  developer_workload: developerReports.getDeveloperWorkloadReport,
  worklog: developerReports.getWorklogReport,
  billable_hours: developerReports.getBillableHoursReport,
  non_billable_hours: developerReports.getNonBillableHoursReport,
  team_performance: developerReports.getTeamPerformanceReport,

  // Project reports
  project_summary: projectReports.getProjectSummaryReport,
  project_progress: projectReports.getProjectProgressReport,
  module_report: projectReports.getModuleReportMain,
  client_project: projectReports.getClientProjectReport,

  // SLA reports
  sla_compliance: slaReports.getSlaComplianceReport,
  sla_breach: slaReports.getSlaBreachReport,

  // Wallet reports
  support_wallet: walletReports.getSupportWalletReport,
  wallet_transaction: walletReports.getWalletTransactionReport,
  wallet_consumption: walletReports.getWalletConsumptionReport,
  wallet_history: walletReports.getWalletHistoryReport,
}

/** Main report orchestrator: validates access, delegates to the correct report function. */
export const getReportData = wrapController('getReportData',
  async (body: ReportFilters, currentUser: { id: string; name: string; email: string; role: UserRole }): Promise<ReportResult> => {
    const { reportType } = body
    if (!reportType) throw new Error('Report type is required')
    if (!checkAccess(currentUser.role, reportType)) throw new Error('Access denied to this report')

    const handler = reportRegistry[reportType]
    if (!handler) throw new Error(`Unknown report type: ${reportType}`)

    return handler(body, currentUser)
  })

/** Returns form data: report type options and filter data. */
export const getReportFormData = wrapController('getReportFormData',
  async (currentUser: { id: string; name: string; email: string; role: UserRole }) => {
    const { REPORT_TYPE_OPTIONS } = await import('../../types/report-types')
    const { db } = await import('../../config/db')
    const { project, user } = await import('../../models/schema')
    const { eq, inArray } = await import('drizzle-orm')

    const projects = currentUser.role === 'client'
      ? await db.select({ id: project.id, name: project.projectName }).from(project).where(eq(project.clientId, currentUser.id))
      : await db.select({ id: project.id, name: project.projectName }).from(project)

    const developers = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.role, 'developer'))
    const clients = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.role, 'client'))

    return { reportTypes: REPORT_TYPE_OPTIONS, projects, developers, clients }
  })
