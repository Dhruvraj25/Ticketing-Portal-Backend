import * as attachmentService from '../services/attachment.service'
import { wrapController } from '../lib/performance-profiler'

export const saveAttachment = wrapController('saveAttachment', async (data: any, currentUser: { id: string }) =>
  attachmentService.saveAttachment(data, currentUser))

export const getAttachments = wrapController('getAttachments', async (ticketId: number) =>
  attachmentService.getAttachments(ticketId))

export const deleteAttachment = wrapController('deleteAttachment', async (attachmentId: number) =>
  attachmentService.deleteAttachment(attachmentId))
