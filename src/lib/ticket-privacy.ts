// ============================================================================
// Ticket Privacy — Role-Based Serialization & Activity Filtering
// ============================================================================
// Clients must never receive internal information: developer/manager identity,
// internal assignments, internal activities, internal comments.
//
// These rules are enforced server-side at the API/service/query layer — the
// frontend is never trusted to hide data it was not meant to receive.
// ============================================================================

// ─── Client-Safe Activity Actions ───────────────────────────────────────────
// Whitelist of ticket-history actions a client is allowed to see.
// Anything not listed here is internal (work started/completed, assignment,
// manager review, rework, estimates workflow, etc.).
export const CLIENT_SAFE_ACTIONS = new Set(['created', 'override_created', 'closed'])

/**
 * True when a history entry is safe for client eyes.
 * `status_change` entries are only safe when the ticket moved to closed
 * (Ticket Closed is a client-safe event).
 */
export function isClientSafeActivity(entry: { action: string; newValue?: string | null }): boolean {
  if (CLIENT_SAFE_ACTIONS.has(entry.action)) return true
  if (entry.action === 'status_change' && entry.newValue) {
    return entry.newValue.toLowerCase().includes('closed')
  }
  return false
}

/**
 * Fields stripped from ticket objects when the viewer is a client.
 * These expose developer/manager identity or internal bookkeeping.
 */
const CLIENT_RESTRICTED_TICKET_FIELDS = [
  'assignedToId',
  'assignedById',
  'assignedAt',
  'overrideBy',
  'estimateApprovedBy',
  'additionalHoursApprovedBy',
  'additionalHoursAutoApproved',
  'additionalHoursDeadline',
  'reservedHours',
  'consumedHours',
  'autoApproved',
  'autoApprovedAt',
  'approvalDeadline',
  'estimateSubmittedAt',
  'estimateApprovedAt',
] as const

/**
 * Serialize a ticket for a viewer based on their role.
 * Clients receive the ticket without internal fields; internal roles receive
 * the full record. Never mutates the input.
 */
export function serializeTicketForRole<T extends Record<string, unknown>>(ticket: T, role: string): T {
  if (role !== 'client') return ticket
  const out: Record<string, unknown> = { ...ticket }
  for (const field of CLIENT_RESTRICTED_TICKET_FIELDS) {
    delete out[field]
  }
  return out as T
}

/**
 * Serialize a list of tickets for a viewer based on their role.
 */
export function serializeTicketsForRole<T extends Record<string, unknown>>(tickets: T[], role: string): T[] {
  if (role !== 'client') return tickets
  return tickets.map(t => serializeTicketForRole(t, role))
}

/**
 * Filter ticket history for a client viewer.
 * Returns client-safe entries with actor identity removed so developer or
 * manager names can never leak through activity.
 */
export function filterHistoryForClient<T extends { action: string; newValue?: string | null; [k: string]: unknown }>(
  history: T[],
): Array<Omit<T, 'userId' | 'userName' | 'userRole'>> {
  return history
    .filter(entry => isClientSafeActivity(entry))
    .map((entry) => {
      const safe: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(entry)) {
        if (key === 'userId' || key === 'userName' || key === 'userRole') continue
        safe[key] = value
      }
      return safe as Omit<T, 'userId' | 'userName' | 'userRole'>
    })
}