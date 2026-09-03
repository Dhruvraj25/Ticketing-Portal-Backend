// ============================================================================
// Manager KPI — Revision & Rework Counts
// ============================================================================
// Returns exact ticket counts for the Requested for Revision and Rework
// workflow states. Scoped to the manager's projects (or all projects for
// admins). The frontend hides cards when a count is zero.
// ============================================================================

import { db } from '../../config/db'
import { ticket, project as projectTable } from '../../models/schema'
import { and, eq, count, inArray } from 'drizzle-orm'

export async function getRevisionReworkCounts(currentUser: { id: string; role: string }) {
  if (currentUser.role !== 'project_manager' && currentUser.role !== 'admin') {
    throw new Error('Access denied')
  }

  let scopedTickets: { status: string }[]
  if (currentUser.role === 'admin') {
    scopedTickets = await db.select({ status: ticket.status }).from(ticket)
  } else {
    // Tickets on projects managed by this manager
    const projects = await db.select({ id: projectTable.id }).from(projectTable).where(eq(projectTable.managerId, currentUser.id))
    const projectIds = projects.map(p => p.id)
    if (projectIds.length === 0) {
      return { revisionCount: 0, reworkCount: 0 }
    }
    scopedTickets = await db.select({ status: ticket.status }).from(ticket).where(inArray(ticket.projectId, projectIds))
  }

  let revisionCount = 0
  let reworkCount = 0
  for (const t of scopedTickets) {
    if (t.status === 'request_for_revision') revisionCount++
    else if (t.status === 'rework') reworkCount++
  }

  return { revisionCount, reworkCount }
}

// ============================================================================
// Client Dashboard Report
// ============================================================================
// Total Tickets / In Progress / Pending for Approval (Client) / Closed,
// scoped to the authenticated client's accessible tickets (their organization).
// ============================================================================

import * as ticketRepo from '../../repositories/ticket.repository'
import { getCurrentUser, getAccessibleClientIds } from '../../services/user.service'

export async function getClientDashboardReport(currentUser: { id: string; role: string; email: string; name: string }) {
  const user = await getCurrentUser(currentUser)
  if (user.role !== 'client') {
    throw new Error('Access denied')
  }

  const clientIds = await getAccessibleClientIds(user)
  const counts = await ticketRepo.clientDashboardCounts(clientIds)

  return {
    totalTickets: counts.total,
    inProgress: counts.inProgress,
    pendingApproval: counts.pendingApproval,
    closed: counts.closed,
  }
}