export type ReportType =
  | 'ticket_summary'
  | 'ticket_status'
  | 'ticket_aging'
  | 'ticket_resolution'
  | 'project_summary'
  | 'project_progress'
  | 'module_report'
  | 'developer_productivity'
  | 'developer_workload'
  | 'worklog'
  | 'billable_hours'
  | 'non_billable_hours'
  | 'client_project'
  | 'sla_compliance'
  | 'sla_breach'
  | 'team_performance'
  | 'assignment'
  | 'analytics'
  | 'support_wallet'
  | 'wallet_transaction'
  | 'wallet_consumption'
  | 'estimate_approval'
  | 'estimate_additional_hours'
  | 'wallet_history'

export const REPORT_TYPE_OPTIONS: { value: ReportType; label: string; category: string }[] = [
  // Tickets
  { value: 'ticket_summary', label: 'Ticket Summary Report', category: 'Tickets' },
  { value: 'ticket_status', label: 'Ticket Status Report', category: 'Tickets' },
  { value: 'ticket_aging', label: 'Ticket Aging Report', category: 'Tickets' },
  { value: 'ticket_resolution', label: 'Ticket Resolution Report', category: 'Tickets' },

  // Projects
  { value: 'project_summary', label: 'Project Summary Report', category: 'Projects' },
  { value: 'project_progress', label: 'Project Progress Report', category: 'Projects' },
  { value: 'module_report', label: 'Module Report', category: 'Projects' },
  { value: 'client_project', label: 'Client Project Report', category: 'Projects' },

  // Developers
  { value: 'developer_productivity', label: 'Resources Report', category: 'Resources' },
  { value: 'developer_workload', label: 'Resource Workload Report', category: 'Resources' },
  { value: 'worklog', label: 'Worklog Report', category: 'Developers' },
  { value: 'billable_hours', label: 'Billable Hours Report', category: 'Developers' },
  { value: 'non_billable_hours', label: 'Non-Billable Hours Report', category: 'Developers' },
  { value: 'team_performance', label: 'Team Performance Report', category: 'Resources' },
  { value: 'assignment', label: 'Assignment Report', category: 'Developers' },

  // Compliance
  { value: 'sla_compliance', label: 'SLA Compliance Report', category: 'Compliance' },
  { value: 'sla_breach', label: 'SLA Breach Report', category: 'Compliance' },

  // Analytics
  { value: 'analytics', label: 'Analytics Report', category: 'Analytics' },

  // Support Wallets
  { value: 'support_wallet', label: 'Support Wallet Report', category: 'Support Wallets' },
  { value: 'wallet_transaction', label: 'Wallet Transaction Report', category: 'Support Wallets' },
  { value: 'wallet_consumption', label: 'Wallet Consumption Report', category: 'Support Wallets' },

  // Estimate Approval
  { value: 'estimate_approval', label: 'Estimate Approval Report', category: 'Estimates' },
  { value: 'estimate_additional_hours', label: 'Additional Hours Report', category: 'Estimates' },

  // Wallet History
  { value: 'wallet_history', label: 'Support Wallet History Report', category: 'Support Wallets' },
]

export const REPORT_TYPE_LABELS: Record<string, string> = {}
for (const opt of REPORT_TYPE_OPTIONS) {
  REPORT_TYPE_LABELS[opt.value] = opt.label
}
