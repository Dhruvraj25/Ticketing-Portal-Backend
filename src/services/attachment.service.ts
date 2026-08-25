import * as attachmentRepo from '../repositories/attachment.repository'
import * as userRepo from '../repositories/user.repository'

export async function saveAttachment(data: any, currentUser: { id: string }) {
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

export async function getAttachments(ticketId: number) {
  const attachments = await attachmentRepo.findByTicketId(ticketId)
  const uploaderIds = [...new Set(attachments.map(a => a.uploadedById))]
  const uploaders = await userRepo.findByIds(uploaderIds)
  const uploaderMap = new Map(uploaders.map(u => [u.id, u]))

  return attachments.map(a => ({
    ...a,
    uploadedByName: uploaderMap.get(a.uploadedById)?.name ?? 'Unknown',
    uploadedByRole: uploaderMap.get(a.uploadedById)?.role ?? 'unknown',
  }))
}

export async function deleteAttachment(attachmentId: number) {
  await attachmentRepo.remove(attachmentId)
}
