import * as ticketService from '../services/ticket.service'
import { wrapController } from '../lib/performance-profiler'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedUser } from '../services/user.service'

export const createTicket = wrapController('createTicket', async (data: any, currentUser: AuthenticatedUser) =>
  ticketService.createTicket(data, currentUser))

export const getTickets = wrapController('getTickets', async (currentUser: AuthenticatedUser) =>
  ticketService.getTicketList(currentUser))

export const getTicketById = wrapController('getTicketById', async (ticketId: number, currentUser: AuthenticatedUser) =>
  ticketService.getTicketById(ticketId, currentUser))

export const updateTicketStatus = wrapController('updateTicketStatus', async (ticketId: number, newStatus: string, currentUser: AuthenticatedUser) =>
  ticketService.updateTicketStatus(ticketId, newStatus, currentUser))

export const assignTicket = wrapController('assignTicket', async (ticketId: number, developerId: string, currentUser: AuthenticatedUser) =>
  ticketService.assignTicket(ticketId, developerId, currentUser))

export const addComment = wrapController('addComment', async (ticketId: number, content: string, isInternal: boolean, currentUser: AuthenticatedUser) =>
  ticketService.addComment(ticketId, content, isInternal, currentUser))

export const getComments = wrapController('getComments', async (ticketId: number, currentUser: AuthenticatedUser) =>
  ticketService.getComments(ticketId, currentUser))

export const getTicketHistory = wrapController('getTicketHistory', async (ticketId: number) =>
  ticketService.getTicketHistory(ticketId))

export const startTimer = wrapController('startTimer', async (ticketId: number, description: string | undefined, currentUser: AuthenticatedUser) =>
  ticketService.startTimer(ticketId, description, currentUser))

export const stopTimer = wrapController('stopTimer', async (timeLogId: number, currentUser: AuthenticatedUser) =>
  ticketService.stopTimer(timeLogId, currentUser))

export const pauseTimer = wrapController('pauseTimer', async (timeLogId: number, currentUser: AuthenticatedUser) =>
  ticketService.pauseTimer(timeLogId, currentUser))

export const resumeTimer = wrapController('resumeTimer', async (timeLogId: number, ticketId: number, description: string | undefined, currentUser: AuthenticatedUser) =>
  ticketService.resumeTimer(timeLogId, ticketId, description, currentUser))
