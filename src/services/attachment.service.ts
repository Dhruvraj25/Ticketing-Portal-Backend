import * as attachmentRepo from '../repositories/attachment.repository'
import * as userRepo from '../repositories/user.repository'
import * as ticketRepo from '../repositories/ticket.repository'
import { ForbiddenError, NotFoundError } from '../utils/errors'
import { getAccessibleClientIds } from './user.service'

/** Enforce ticket visibility for attachment operations (server-side). */
async function assertTicketAccess(ticketId: number, currentUser: { id: string; role: string }) {
  const t = await ticketRepo.findById(ticketId)
  if (!t) throw new NotFoundError('Ticket not found')

  if (currentUser.role === 'admin') return
  if (currentUser.role === 'developer') {
    if (t.assignedToId !== currentUser.id) throw new ForbiddenError('Access denied')
    return
  }
  if (currentUser.role === 'project_manager') {
    if (t.projectId) {
      const { project } = await import('../models/schema')
      const { db } = await import('../config/db')
      const { eq } = await import('drizzle-orm')
      const [proj] = await db.select({ managerId: project.managerId }).from(project).where(eq(project.id, t.projectId)).limit(1)
      if (proj && proj.managerId === currentUser.id) return
    }
    throw new ForbiddenError('Access denied')
  }
  if (currentUser.role === 'client') {
    const user = await userRepo.findByPk(currentUser.id)
    const clientIds = await getAccessibleClientIds({ id: currentUser.id, role: 'client', accountId: user?.accountId })
    if (clientIds.includes(t.clientId)) return
    throw new ForbiddenError('Access denied')
  }
  throw new ForbiddenError('Access denied')
}

export async function saveAttachment(data: any, currentUser: { id: string; role: string }) {
  if (!data.ticketId) throw new Error('ticketId is required')
  await assertTicketAccess(data.ticketId, currentUser)
  return attachmentRepo.create({
    ticketId: data.ticketId,
    uploadedById: currentUser.id,
    filename: data.filename,
    url: data.url,
    publicId: data.publicId,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
  })
}

export async function getAttachments(ticketId: number, currentUser: { id: string; role: string }) {
  await assertTicketAccess(ticketId, currentUser)
  const attachments = await attachmentRepo.findByTicketId(ticketId)
  const uploaderIds = [...new Set(attachments.map(a => a.uploadedById))]
  const uploaders = await userRepo.findByIds(uploaderIds)
  const uploaderMap = new Map(uploaders.map(u => [u.id, u]))

  // Privacy: clients never see the identity of internal uploaders.
  return attachments.map(a => {
    const uploader = uploaderMap.get(a.uploadedById)
    const isInternalStaff = uploader && uploader.role !== 'client'
    return {
      ...a,
      uploadedByName: currentUser.role === 'client' && isInternalStaff ? undefined : (uploader?.name ?? 'Unknown'),
      uploadedByRole: currentUser.role === 'client' && isInternalStaff ? undefined : (uploader?.role ?? 'unknown'),
    }
  })
}

export async function deleteAttachment(attachmentId: number, currentUser: { id: string; role: string }) {
  const attachment = await attachmentRepo.findById(attachmentId)
  if (!attachment) throw new NotFoundError('Attachment not found')
  await assertTicketAccess(attachment.ticketId, currentUser)
  await attachmentRepo.remove(attachmentId)
}