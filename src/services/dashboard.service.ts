import * as projectRepo from '../repositories/project.repository'
import * as ticketRepo from '../repositories/ticket.repository'
import * as notificationRepo from '../repositories/notification.repository'
import * as userRepo from '../repositories/user.repository'
import { getCurrentUser } from './user.service'
import type { AuthenticatedUser } from './user.service'

/**
 * Orchestrator: fetches all dashboard KPIs and widgets in parallel.
 * Returns a single consolidated result so the controller only calls one function.
 */
export async function getDashboardData(currentUser: AuthenticatedUser) {
  const user = await getCurrentUser(currentUser)

  // All independent queries run in parallel
  const [projectKPIs, ticketKPIsArr, timeTotal, notifications, unreadCount] = await Promise.all([
    projectRepo.kpiCounts(),
    ticketRepo.statusFilterCounts(),
    ticketRepo.totalLoggedMinutes(),
    notificationRepo.findByUserId(user.id),
    notificationRepo.unreadCount(user.id),
  ])

  const ticketKPIs = ticketKPIsArr?.[0]
  const totalProjectHours = Math.round((Number(timeTotal) || 0) / 60 * 10) / 10

  return {
    kpis: {
      totalProjects: Number(projectKPIs?.total) || 0,
      activeProjects: Number(projectKPIs?.active) || 0,
      totalProjectHours,
      openTickets: Number(ticketKPIs?.openCount) || 0,
      closedTickets: Number(ticketKPIs?.closedCount) || 0,
    },
    notifications,
    unreadCount,
  }
}

/**
 * Get sidebar widget data: developer counts, open tickets, etc.
 */
export async function getSidebarWidgets(currentUser: AuthenticatedUser) {
  const user = await getCurrentUser(currentUser)
  const developers = await userRepo.findByRole('developer')
  return { developers, user }
}
