import * as moduleRepo from '../repositories/module.repository'
import * as ticketRepo from '../repositories/ticket.repository'
import { assertFound } from '../utils/errors'
import { BadRequestError } from '../utils/errors'
import { VALIDATION, validateField } from '../types/index'

export async function getModuleList(projectId: number | undefined, currentUser: { id: string; role: string }) {
  const conditions: any[] = []
  if (projectId !== undefined) conditions.push(projectId)
  const rows = await moduleRepo.findMany(conditions)

  const moduleIds = rows.map(r => r.id)
  const ticketCounts = moduleIds.length > 0
    ? await ticketRepo.countByModuleIds(moduleIds)
    : []
  const ticketCountMap = new Map(ticketCounts.filter(r => r.moduleId !== null).map(r => [r.moduleId as number, Number(r.count) || 0]))

  return rows.map(r => ({ ...r, ticketCount: ticketCountMap.get(r.id) || 0 }))
}

export async function getModuleById(moduleId: number) {
  const m = await moduleRepo.findById(moduleId)
  assertFound(m, 'Module not found')
  const ticketCount = await ticketRepo.countByModuleId(moduleId)
  return { ...m, ticketCount }
}

export async function createModule(data: any) {
  const nameErr = validateField(data.moduleName, VALIDATION.MODULE_NAME_MAX_LENGTH, 'Module name')
  if (nameErr) throw new BadRequestError(nameErr)
  if (data.description) {
    const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
    if (descErr) throw new BadRequestError(descErr)
  }
  return moduleRepo.create({
    projectId: data.projectId,
    moduleName: data.moduleName,
    description: data.description ?? null,
    status: 'active',
  })
}

export async function updateModule(moduleId: number, data: any) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (data.moduleName !== undefined) {
    const nameErr = validateField(data.moduleName, VALIDATION.MODULE_NAME_MAX_LENGTH, 'Module name')
    if (nameErr) throw new BadRequestError(nameErr)
    updateData.moduleName = data.moduleName
  }
  if (data.description !== undefined) {
    if (data.description !== null) {
      const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
      if (descErr) throw new BadRequestError(descErr)
    }
    updateData.description = data.description
  }
  if (data.status !== undefined) updateData.status = data.status
  return moduleRepo.update(moduleId, updateData)
}

export async function deleteModule(moduleId: number) {
  await moduleRepo.remove(moduleId)
}

export async function getModuleNames() {
  return moduleRepo.selectNames()
}
