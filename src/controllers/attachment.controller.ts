import * as attachmentService from '../services/attachment.service'
import { wrapController } from '../lib/performance-profiler'
import type { AuthenticatedUser } from '../services/user.service'

export const saveAttachment = wrapController('saveAttachment', async (data: any, currentUser: AuthenticatedUser) =>
  attachmentService.saveAttachment(data, currentUser))

export const getAttachments = wrapController('getAttachments', async (ticketId: number, currentUser: AuthenticatedUser) =>
  attachmentService.getAttachments(ticketId, currentUser))

export const deleteAttachment = wrapController('deleteAttachment', async (attachmentId: number, currentUser: AuthenticatedUser) =>
  attachmentService.deleteAttachment(attachmentId, currentUser))