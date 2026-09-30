// Billing rule — dependency-free so it can be compared with the Frontend's
// lib/billing.ts in tests. See ./billing.ts for the full description.

export interface BillingFacts {
  estimateWorkflowSkipped?: boolean | null
  assignedToId?: string | null
  consumedHours?: number | null
}

/** Historical ticket (estimate skipped, no assignee) that consumed Support Wallet hours. */
export function isHistoricalWalletTicket(t: BillingFacts): boolean {
  return t.estimateWorkflowSkipped === true && !t.assignedToId && (Number(t.consumedHours) || 0) > 0
}

/** THE billing rule (same as Frontend lib/billing.ts isBillableTicket). */
export function isBillableTicket(t: BillingFacts): boolean {
  return t.estimateWorkflowSkipped !== true || isHistoricalWalletTicket(t)
}
