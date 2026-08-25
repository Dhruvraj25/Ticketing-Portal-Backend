export type UserRole = 'client' | 'developer' | 'project_manager' | 'admin'

// ============================================================================
// Centralized TicketStatus Enum — used across backend, frontend, APIs, and DB
// ============================================================================

export const TicketStatus = {
  NEW: 'new',
  MANAGER_REVIEW: 'manager_review',
  ESTIMATE_PENDING: 'estimate_pending',
  ESTIMATE_APPROVED: 'estimate_approved',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLIENT_REVIEW: 'client_review',
  CLOSED: 'closed',
  REQUEST_FOR_REVISION: 'request_for_revision',
} as const

export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus]

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent' | 'critical'

export type TicketCategory = 'general' | 'bug' | 'feature' | 'support' | 'integration' | 'customization'

export interface TicketWithRelations {
  id: number
  ticketNumber: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  category: TicketCategory
  clientId: string
  clientName?: string
  clientEmail?: string
  projectId: number | null
  moduleId: number | null
  projectName?: string
  projectCode?: string
  moduleName?: string
  assignedToId: string | null
  assignedToName?: string
  assignedById: string | null
  assignedByName?: string
  assignedAt: Date | null
  resolvedAt: Date | null
  closedAt: Date | null
  isOverrideTicket?: boolean
  overrideReason?: string | null
  overrideBy?: string | null
  overrideDate?: Date | null
  estimatedHours?: number | null
  estimatedCompletionDate?: string | null
  estimateNotes?: string | null
  estimateSubmittedAt?: Date | null
  estimateApprovedAt?: Date | null
  estimateApprovedBy?: string | null
  autoApproved?: boolean | null
  autoApprovedAt?: Date | null
  approvalDeadline?: Date | null
  additionalHoursRequested?: number | null
  additionalHoursApproved?: boolean | null
  additionalHoursApprovedBy?: string | null
  additionalHoursAutoApproved?: boolean | null
  additionalHoursDeadline?: Date | null
  reservedHours?: number | null
  consumedHours?: number | null
  revisionCount?: number
  createdAt: Date
  updatedAt: Date
  commentCount?: number
  attachmentCount?: number
  totalTimeMinutes?: number
}

export interface CommentWithUser {
  id: number
  ticketId: number
  userId: string
  userName: string
  userRole: UserRole
  content: string
  isInternal: boolean
  createdAt: Date
}

export interface TimeLogWithUser {
  id: number
  ticketId: number
  userId: string
  userName: string
  description: string | null
  startTime: Date
  endTime: Date | null
  durationMinutes: number | null
  isBillable: boolean
  createdAt: Date
}

export interface TicketHistoryWithUser {
  id: number
  ticketId: number
  userId: string
  userName: string
  action: string
  oldValue: string | null
  newValue: string | null
  createdAt: Date
}

export interface DashboardStats {
  totalTickets: number
  openTickets: number
  inProgressTickets: number
  resolvedTickets: number
  avgResolutionTimeHours: number
  ticketsByPriority: { priority: string; count: number }[]
  ticketsByCategory: { category: string; count: number }[]
  recentActivity: TicketHistoryWithUser[]
}

export interface DeveloperStats {
  assignedTickets: number
  completedTickets: number
  totalTimeLoggedMinutes: number
  activeTimer: TimeLogWithUser | null
}

export interface ManagerStats {
  totalDevelopers: number
  unassignedTickets: number
  ticketsByDeveloper: { developerId: string; developerName: string; count: number }[]
  overdueTickets: number
}

export const TICKET_STATUS_CONFIG: Record<TicketStatus, { label: string; color: string }> = {
  [TicketStatus.NEW]: { label: 'New Request', color: 'bg-blue-50 text-blue-600 border-blue-200' },
  [TicketStatus.MANAGER_REVIEW]: { label: 'Under Review', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  [TicketStatus.ESTIMATE_PENDING]: { label: 'Awaiting Estimate Approval', color: 'bg-sky-50 text-sky-600 border-sky-200' },
  [TicketStatus.ESTIMATE_APPROVED]: { label: 'Estimate Approved', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  [TicketStatus.ASSIGNED]: { label: 'Assigned to Resource', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  [TicketStatus.IN_PROGRESS]: { label: 'Work in Progress', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  [TicketStatus.RESOLVED]: { label: 'Ready for Client Review', color: 'bg-green-50 text-green-600 border-green-200' },
  [TicketStatus.CLIENT_REVIEW]: { label: 'Awaiting Client Review', color: 'bg-sky-50 text-sky-600 border-sky-200' },
  [TicketStatus.CLOSED]: { label: 'Completed', color: 'bg-gray-50 text-gray-500 border-gray-200' },
  [TicketStatus.REQUEST_FOR_REVISION]: { label: 'Revision Requested', color: 'bg-orange-50 text-orange-600 border-orange-200' },
}

export const TICKET_PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string }> = {
  low: { label: 'LOW', color: 'bg-gray-50 text-gray-500 border-gray-200' },
  medium: { label: 'MEDIUM', color: 'bg-blue-50 text-blue-600 border-blue-200' },
  high: { label: 'HIGH', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  urgent: { label: 'URGENT', color: 'bg-red-50 text-red-600 border-red-200' },
  critical: { label: 'CRITICAL', color: 'bg-red-50 text-red-600 border-red-200' },
}

export const TICKET_CATEGORY_CONFIG: Record<TicketCategory, { label: string; icon: string }> = {
  general: { label: 'General', icon: 'HelpCircle' },
  bug: { label: 'Bug Report', icon: 'Bug' },
  feature: { label: 'Feature Request', icon: 'Lightbulb' },
  support: { label: 'Support', icon: 'Headphones' },
  integration: { label: 'Integration', icon: 'Plug' },
  customization: { label: 'Customization', icon: 'Settings' },
}

// ============================================================================
// Project & Module Types
// ============================================================================

export type ProjectStatus = 'active' | 'inactive' | 'on_hold' | 'completed' | 'archived'

export type ModuleStatus = 'active' | 'inactive' | 'completed' | 'archived'

export interface ProjectWithRelations {
  id: number
  projectName: string
  projectCode: string
  clientId: string
  clientName?: string
  clientEmail?: string
  managerId: string
  managerName?: string
  managerEmail?: string
  description: string | null
  startDate: string | null
  status: ProjectStatus
  createdAt: Date
  updatedAt: Date
  moduleCount?: number
  ticketCount?: number
}

export interface ModuleWithRelations {
  id: number
  projectId: number
  projectName?: string
  projectCode?: string
  moduleName: string
  description: string | null
  status: ModuleStatus
  createdAt: Date
  updatedAt: Date
  ticketCount?: number
}

export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-50 text-green-600 border-green-200' },
  inactive: { label: 'Inactive', color: 'bg-gray-50 text-gray-500 border-gray-200' },
  on_hold: { label: 'On Hold', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  completed: { label: 'Completed', color: 'bg-blue-50 text-blue-600 border-blue-200' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-400 border-gray-200' },
}

export const MODULE_STATUS_CONFIG: Record<ModuleStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-50 text-green-600 border-green-200' },
  inactive: { label: 'Inactive', color: 'bg-gray-50 text-gray-500 border-gray-200' },
  completed: { label: 'Completed', color: 'bg-blue-50 text-blue-600 border-blue-200' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-400 border-gray-200' },
}

// ============================================================================
// Support Wallet Types
// ============================================================================

export type WalletStatus = 'active' | 'inactive' | 'suspended' | 'expired'

export type WalletTransactionType = 'Add Hours' | 'Deduct Hours' | 'Adjustment' | 'Emergency Credit'

export type WalletAlertType = 'low_balance_warning' | 'low_balance_restricted' | 'contract_expiring' | 'wallet_recharged'

export type OverrideReasonType = 'Critical Production Issue' | 'Contract Renewal In Progress' | 'Emergency Support' | 'Management Approval'

export const WALLET_TRANSACTION_TYPES: WalletTransactionType[] = [
  'Add Hours',
  'Deduct Hours',
  'Adjustment',
  'Emergency Credit',
]

export const WALLET_ALERT_TYPES: WalletAlertType[] = [
  'low_balance_warning',
  'low_balance_restricted',
  'contract_expiring',
  'wallet_recharged',
]

export const OVERRIDE_REASONS: OverrideReasonType[] = [
  'Critical Production Issue',
  'Contract Renewal In Progress',
  'Emergency Support',
  'Management Approval',
]

export interface SupportWallet {
  id: number
  clientId: string
  projectId: number
  totalPurchasedHours: number
  reservedHours: number
  consumedHours: number
  remainingHours: number
  contractStartDate: string | null
  contractEndDate: string | null
  status: WalletStatus
  createdAt: Date
  updatedAt: Date
  clientName?: string
  clientEmail?: string
  projectName?: string
  projectCode?: string
}

export interface WalletTransaction {
  id: number
  walletId: number
  transactionType: WalletTransactionType
  hours: number
  previousBalance: number
  newBalance: number
  reason: string | null
  remarks: string | null
  performedBy: string
  performedAt: Date
  performedByName?: string
}

export interface WalletAlert {
  id: number
  walletId: number
  alertType: WalletAlertType
  message: string
  createdAt: Date
  resolvedAt: Date | null
  clientName?: string
  projectName?: string
}

export const WALLET_STATUS_CONFIG: Record<WalletStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-50 text-green-600 border-green-200' },
  inactive: { label: 'Inactive', color: 'bg-gray-50 text-gray-500 border-gray-200' },
  suspended: { label: 'Suspended', color: 'bg-red-50 text-red-600 border-red-200' },
  expired: { label: 'Expired', color: 'bg-amber-50 text-amber-600 border-amber-200' },
}

export const USER_ROLE_CONFIG: Record<UserRole, { label: string; color: string }> = {
  client: { label: 'Client', color: 'bg-blue-50 text-blue-600 border-blue-200' },
  developer: { label: 'Developer', color: 'bg-green-50 text-green-600 border-green-200' },
  project_manager: { label: 'Project Manager', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  admin: { label: 'Admin', color: 'bg-amber-50 text-amber-600 border-amber-200' },
}

// ============================================================================
// Estimate Approval Types
// ============================================================================

export type EstimateStatus = 'pending' | 'approved' | 'rejected' | 'clarification_requested'

export interface EstimateData {
  estimatedHours: number
  estimatedCompletionDate: string
  estimateNotes: string
}

export const OVERRIDE_REASONS_ESTIMATE = [
  'Critical Production Issue',
  'Contract Renewal In Progress',
  'Emergency Support',
  'Management Approval',
] as const

export const ESTIMATE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  approved: { label: 'Approved', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  rejected: { label: 'Declined', color: 'bg-red-50 text-red-600 border-red-200' },
  clarification_requested: { label: 'Clarification Requested', color: 'bg-sky-50 text-sky-600 border-sky-200' },
}

export const AUTO_APPROVAL_DAYS = 30
export const AUTO_APPROVAL_REMINDER_DAYS = [7, 15, 25]

// ============================================================================
// Validation Constants — shared between frontend and backend
// ============================================================================

export const VALIDATION = {
  DESCRIPTION_MAX_LENGTH: 1024,
  TICKET_TITLE_MAX_LENGTH: 150,
  PROJECT_NAME_MAX_LENGTH: 100,
  MODULE_NAME_MAX_LENGTH: 100,
  USER_NAME_MAX_LENGTH: 80,
  CLIENT_NAME_MAX_LENGTH: 100,
  COMMENT_MAX_LENGTH: 512,
  REVISION_NOTES_MAX_LENGTH: 2048,
  ESTIMATE_NOTES_MAX_LENGTH: 1024,
  REJECT_REASON_MAX_LENGTH: 1024,
  CLARIFICATION_MESSAGE_MAX_LENGTH: 1024,
  REVISION_REASON_MAX_LENGTH: 1024,
  ADDITIONAL_HOURS_REASON_MAX_LENGTH: 1024,
  ENVIRONMENT_MAX_LENGTH: 50,
  ADDITIONAL_INFO_MAX_LENGTH: 2048,
} as const

/**
 * Reject strings that are empty or contain only whitespace.
 */
export function isValidTrimmed(value: string): boolean {
  return value.trim().length > 0
}

/**
 * Validate a string field: not just whitespace, and within max length.
 */
export function validateField(value: string, maxLength: number, fieldName: string): string | null {
  if (!isValidTrimmed(value)) {
    return `${fieldName} cannot be empty or contain only spaces.`
  }
  if (value.trim().length > maxLength) {
    return `${fieldName} must be at most ${maxLength} characters.`
  }
  return null
}

// ============================================================================
// Revision Types
// ============================================================================

export interface RevisionHistory {
  id: number
  ticketId: number
  revisionNumber: number
  requestedById: string
  requestedByName?: string
  requestedByRole?: string
  revisionNotes: string
  priority: string | null
  attachments: string | null
  status: string
  resolvedAt: Date | null
  createdAt: Date
}
