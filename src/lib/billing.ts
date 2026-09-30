// ============================================================================
// Billable vs Non-Billable — same rule as the Frontend's lib/billing.ts
// ============================================================================
//   Billable     → the ticket follows the estimate / support-hour workflow.
//   Non-Billable → the estimate workflow was skipped ("Assign Directly").
//   EXCEPT a historical ticket (estimate skipped, no assignee) that consumed
//   Support Wallet hours (consumedHours > 0) → Billable.
// The ticket is the source of truth; time_log.isBillable is a copy stamped
// from this rule (never rewritten), used only when a log's ticket is gone.
// ============================================================================

import { sql } from 'drizzle-orm'
import { timeLog } from '../models/schema'

export { isBillableTicket, isHistoricalWalletTicket, type BillingFacts } from './billing-rule'

/** Whether a time_log row is billable — read from its ticket (same rule). */
export const timeLogIsBillable = sql<boolean>`COALESCE(
  (SELECT (NOT bt."estimateWorkflowSkipped")
          OR (bt."assignedToId" IS NULL AND COALESCE(bt."consumedHours", 0) > 0)
     FROM "ticket" bt WHERE bt.id = ${timeLog.ticketId}),
  ${timeLog.isBillable}
)`
