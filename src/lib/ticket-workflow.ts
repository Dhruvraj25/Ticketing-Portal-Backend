// ============================================================================
// Ticket Workflow — Authoritative Backend State Machine
// ============================================================================
// The backend is the source of truth for ticket status. This module defines:
//   - every known ticket status
//   - which transitions are valid (from → to)
//   - which roles may perform each transition
//
// The frontend may request a status change, but the backend validates it here
// before anything is persisted. Invalid or unauthorized transitions are
// rejected with a clear error.
//
// Status vocabulary (kept stable with the DB, which stores status as text):
//   draft, new/open, manager_review, estimate_pending, estimate_approved,
//   assigned, in_progress, resolved, client_review, request_for_revision,
//   rework, closed
//
// Key workflow rules enforced here:
//   - A developer completing work moves the ticket to MANAGER_REVIEW — never
//     directly to Client Review.
//   - Manager Review can forward the ticket to the client (client_review) or
//     send it back for internal REWORK.
//   - A client requesting a change moves the ticket to REQUEST_FOR_REVISION —
//     a separate state from REWORK (manager-internal).
// ============================================================================

export const TicketWorkflowStatus = {
  DRAFT: 'draft',
  NEW: 'new',
  OPEN: 'open',
  MANAGER_REVIEW: 'manager_review',
  ESTIMATE_PENDING: 'estimate_pending',
  ESTIMATE_APPROVED: 'estimate_approved',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLIENT_REVIEW: 'client_review',
  REQUEST_FOR_REVISION: 'request_for_revision',
  REWORK: 'rework',
  CLOSED: 'closed',
} as const

export type TicketWorkflowStatusValue = (typeof TicketWorkflowStatus)[keyof typeof TicketWorkflowStatus]

/** 'open' is a legacy alias of 'new' — normalize before validation. */
function normalizeStatus(status: string): string {
  const s = (status || '').trim().toLowerCase()
  return s === TicketWorkflowStatus.OPEN ? TicketWorkflowStatus.NEW : s
}

/** All known statuses (for validation of inbound values). */
export const ALL_TICKET_STATUSES: string[] = Object.values(TicketWorkflowStatus)

// ─── Transition Map ─────────────────────────────────────────────────────────

/** Valid from → to transitions (after normalizing 'open' → 'new'). */
export const TICKET_TRANSITIONS: Record<string, string[]> = {
  draft: [TicketWorkflowStatus.NEW, TicketWorkflowStatus.CLOSED],
  new: [
    TicketWorkflowStatus.MANAGER_REVIEW,
    TicketWorkflowStatus.ESTIMATE_PENDING,
    TicketWorkflowStatus.ESTIMATE_APPROVED,
    TicketWorkflowStatus.ASSIGNED,
    TicketWorkflowStatus.IN_PROGRESS,
    TicketWorkflowStatus.RESOLVED,
    TicketWorkflowStatus.CLIENT_REVIEW,
    TicketWorkflowStatus.REQUEST_FOR_REVISION,
    TicketWorkflowStatus.REWORK,
    TicketWorkflowStatus.CLOSED,
  ],
  manager_review: [
    TicketWorkflowStatus.ESTIMATE_PENDING,
    TicketWorkflowStatus.ESTIMATE_APPROVED,
    TicketWorkflowStatus.ASSIGNED,
    TicketWorkflowStatus.IN_PROGRESS,
    TicketWorkflowStatus.RESOLVED,
    TicketWorkflowStatus.CLIENT_REVIEW,
    TicketWorkflowStatus.REQUEST_FOR_REVISION,
    TicketWorkflowStatus.REWORK,
    TicketWorkflowStatus.CLOSED,
  ],
  estimate_pending: [
    TicketWorkflowStatus.ESTIMATE_APPROVED,
    TicketWorkflowStatus.ASSIGNED,
    TicketWorkflowStatus.IN_PROGRESS,
    TicketWorkflowStatus.RESOLVED,
    TicketWorkflowStatus.CLIENT_REVIEW,
    TicketWorkflowStatus.REQUEST_FOR_REVISION,
    TicketWorkflowStatus.REWORK,
    TicketWorkflowStatus.CLOSED,
  ],
  estimate_approved: [
    TicketWorkflowStatus.ASSIGNED,
    TicketWorkflowStatus.IN_PROGRESS,
    TicketWorkflowStatus.RESOLVED,
    TicketWorkflowStatus.CLIENT_REVIEW,
    TicketWorkflowStatus.REQUEST_FOR_REVISION,
    TicketWorkflowStatus.REWORK,
    TicketWorkflowStatus.CLOSED,
  ],
  assigned: [
    TicketWorkflowStatus.IN_PROGRESS,
    TicketWorkflowStatus.MANAGER_REVIEW,
    TicketWorkflowStatus.RESOLVED,
    TicketWorkflowStatus.CLIENT_REVIEW,
    TicketWorkflowStatus.REQUEST_FOR_REVISION,
    TicketWorkflowStatus.REWORK,
    TicketWorkflowStatus.CLOSED,
  ],
  in_progress: [
    TicketWorkflowStatus.MANAGER_REVIEW,
    TicketWorkflowStatus.RESOLVED,
    TicketWorkflowStatus.CLIENT_REVIEW,
    TicketWorkflowStatus.REQUEST_FOR_REVISION,
    TicketWorkflowStatus.REWORK,
    TicketWorkflowStatus.CLOSED,
  ],
  resolved: [
    TicketWorkflowStatus.CLIENT_REVIEW,
    TicketWorkflowStatus.CLOSED,
    TicketWorkflowStatus.REQUEST_FOR_REVISION,
    TicketWorkflowStatus.REWORK,
    TicketWorkflowStatus.IN_PROGRESS,
  ],
  client_review: [
    TicketWorkflowStatus.CLOSED,
    TicketWorkflowStatus.REQUEST_FOR_REVISION,
    TicketWorkflowStatus.REWORK,
    TicketWorkflowStatus.IN_PROGRESS,
    TicketWorkflowStatus.RESOLVED,
  ],
  request_for_revision: [
    TicketWorkflowStatus.IN_PROGRESS,
    TicketWorkflowStatus.ASSIGNED,
    TicketWorkflowStatus.MANAGER_REVIEW,
    TicketWorkflowStatus.RESOLVED,
    TicketWorkflowStatus.CLIENT_REVIEW,
    TicketWorkflowStatus.CLOSED,
  ],
  rework: [
    TicketWorkflowStatus.IN_PROGRESS,
    TicketWorkflowStatus.ASSIGNED,
    TicketWorkflowStatus.MANAGER_REVIEW,
    TicketWorkflowStatus.RESOLVED,
    TicketWorkflowStatus.CLIENT_REVIEW,
    TicketWorkflowStatus.CLOSED,
  ],
  closed: [TicketWorkflowStatus.IN_PROGRESS, TicketWorkflowStatus.NEW],
}

// ─── Role Rules ─────────────────────────────────────────────────────────────

export type WorkflowRole = 'client' | 'developer' | 'project_manager' | 'admin'

/**
 * Target statuses a role may set, per current state.
 * `*` means unrestricted by current state (still subject to the transition map).
 */
const ROLE_TRANSITION_RULES: Record<WorkflowRole, { targets: string[]; from?: string[] }> = {
  // A client creates tickets, approves estimates and closes/requests revision
  // on tickets that are awaiting their review.
  client: {
    targets: [
      TicketWorkflowStatus.ESTIMATE_APPROVED,
      TicketWorkflowStatus.CLOSED,
      TicketWorkflowStatus.REQUEST_FOR_REVISION,
    ],
    from: [
      TicketWorkflowStatus.ESTIMATE_PENDING,
      TicketWorkflowStatus.RESOLVED,
      TicketWorkflowStatus.CLIENT_REVIEW,
    ],
  },
  // A developer starts work and marks work complete. Completion routes to
  // MANAGER_REVIEW — the developer can never push the ticket straight to
  // Client Review.
  developer: {
    targets: [TicketWorkflowStatus.IN_PROGRESS, TicketWorkflowStatus.MANAGER_REVIEW],
    from: [
      TicketWorkflowStatus.ASSIGNED,
      TicketWorkflowStatus.IN_PROGRESS,
      TicketWorkflowStatus.REQUEST_FOR_REVISION,
      TicketWorkflowStatus.REWORK,
      TicketWorkflowStatus.MANAGER_REVIEW,
    ],
  },
  // Managers (and admins) drive the workflow: review, estimates, assignment,
  // forwarding to the client, and internal rework.
  project_manager: { targets: ALL_TICKET_STATUSES },
  admin: { targets: ALL_TICKET_STATUSES },
}

/**
 * Validate a requested status transition.
 *
 * @returns an error message, or null when the transition is allowed.
 */
export function validateStatusTransition(
  currentStatus: string,
  targetStatus: string,
  role: string,
): string | null {
  const current = normalizeStatus(currentStatus)
  const target = (targetStatus || '').trim().toLowerCase()

  if (!ALL_TICKET_STATUSES.includes(target)) {
    return `Unknown ticket status: ${targetStatus}`
  }

  const allowedTargets = TICKET_TRANSITIONS[current]
  if (!allowedTargets) {
    return `Ticket is in an unknown state: ${currentStatus}`
  }
  if (!allowedTargets.includes(target)) {
    return `Invalid status transition from "${current}" to "${target}"`
  }

  const rule = ROLE_TRANSITION_RULES[role as WorkflowRole]
  if (!rule) {
    return `Role "${role}" cannot change ticket status`
  }

  if (rule.targets !== ALL_TICKET_STATUSES && !rule.targets.includes(target)) {
    return `Role "${role}" is not allowed to set status "${target}"`
  }

  if (rule.from && !rule.from.includes(current)) {
    return `Role "${role}" cannot move a ticket from "${current}" to "${target}"`
  }

  return null
}

/** True when the given status represents a state awaiting client review. */
export function isAwaitingClientReview(status: string): boolean {
  const s = normalizeStatus(status)
  return s === TicketWorkflowStatus.RESOLVED || s === TicketWorkflowStatus.CLIENT_REVIEW
}

/** True when the given status represents a closed ticket. */
export function isClosedStatus(status: string): boolean {
  return normalizeStatus(status) === TicketWorkflowStatus.CLOSED
}

/** True when the status is a client-visible workflow state. */
export function isClientVisibleStatus(status: string): boolean {
  const s = normalizeStatus(status)
  const clientVisible: string[] = [
    TicketWorkflowStatus.NEW,
    TicketWorkflowStatus.ESTIMATE_PENDING,
    TicketWorkflowStatus.ESTIMATE_APPROVED,
    TicketWorkflowStatus.RESOLVED,
    TicketWorkflowStatus.CLIENT_REVIEW,
    TicketWorkflowStatus.REQUEST_FOR_REVISION,
    TicketWorkflowStatus.CLOSED,
  ]
  return clientVisible.includes(s)
}