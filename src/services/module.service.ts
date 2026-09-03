import * as moduleRepo from '../repositories/module.repository'
import * as projectRepo from '../repositories/project.repository'
import * as ticketRepo from '../repositories/ticket.repository'
import { db } from '../config/db'
import { project as projectTable, module as moduleTable } from '../models/schema'
import { inArray } from 'drizzle-orm'
import { assertFound } from '../utils/errors'
import { BadRequestError, ForbiddenError } from '../utils/errors'
import { VALIDATION, validateField } from '../types/index'
import { getAccessibleClientIds } from './user.service'

/**
 * Resolve the project IDs a user may access for module browsing:
 *   - client: projects of their entire organization (client tenant)
 *   - project_manager: projects they manage
 *   - developer/admin: unrestricted (null)
 */
async function getAccessibleProjectIds(user: { id: string; role: string }): Promise<number[] | null> {
  if (user.role === 'admin' || user.role === 'developer') return null
  if (user.role === 'client') {
    const clientIds = await getAccessibleClientIds({ id: user.id, role: 'client' })
    const rows = await db.select({ id: projectTable.id }).from(projectTable).where(inArray(projectTable.clientId, clientIds))
    return rows.map(r => r.id)
  }
  if (user.role === 'project_manager') {
    const rows = await db.select({ id: projectTable.id }).from(projectTable).where(inArray(projectTable.managerId, [user.id]))
    return rows.map(r => r.id)
  }
  return []
}

export async function getModuleList(projectId: number | undefined, currentUser: { id: string; role: string }) {
  const allowedProjectIds = await getAccessibleProjectIds(currentUser)

  // Clients / managers may only browse modules of projects they can access.
  if (projectId !== undefined && allowedProjectIds !== null && !allowedProjectIds.includes(projectId)) {
    throw new ForbiddenError('Access denied')
  }

  const conditions: any[] = []
  if (projectId !== undefined) {
    conditions.push(inArray(moduleTable.projectId, [projectId]))
  } else if (allowedProjectIds !== null) {
    if (allowedProjectIds.length === 0) return []
    conditions.push(inArray(moduleTable.projectId, allowedProjectIds))
  }
  const rows = await moduleRepo.findMany(conditions)

  const moduleIds = rows.map(r => r.id)
  const ticketCounts = moduleIds.length > 0
    ? await ticketRepo.countByModuleIds(moduleIds)
    : []
  const ticketCountMap = new Map(ticketCounts.filter(r => r.moduleId !== null).map(r => [r.moduleId as number, Number(r.count) || 0]))

  return rows.map(r => ({ ...r, ticketCount: ticketCountMap.get(r.id) || 0 }))
}

async function assertModuleAccess(moduleId: number, user: { id: string; role: string }, requireWrite: boolean) {
  const m = await moduleRepo.findById(moduleId)
  assertFound(m, 'Module not found')

  if (user.role === 'admin') return m
  if (user.role === 'client') {
    // Clients can only read modules of their own organization's projects.
    if (requireWrite) throw new ForbiddenError('Access denied')
    const clientIds = await getAccessibleClientIds({ id: user.id, role: 'client' })
    const project = await projectRepo.findById(m.projectId).catch(() => null)
    if (project && clientIds.includes(project.clientId)) return m
    throw new ForbiddenError('Access denied')
  }
  if (user.role === 'project_manager') {
    const project = await projectRepo.findById(m.projectId).catch(() => null)
    if (project && project.managerId === user.id) return m
    throw new ForbiddenError('Access denied')
  }
  if (user.role === 'developer') {
    if (requireWrite) throw new ForbiddenError('Access denied')
    return m
  }
  throw new ForbiddenError('Access denied')
}

export async function getModuleById(moduleId: number, currentUser: { id: string; role: string }) {
  const m = await assertModuleAccess(moduleId, currentUser, false)
  const ticketCount = await ticketRepo.countByModuleId(moduleId)
  return { ...m, ticketCount }
}

export async function createModule(data: any, currentUser: { id: string; role: string }) {
  if (currentUser.role !== 'admin' && currentUser.role !== 'project_manager') {
    throw new ForbiddenError('Only admins and managers can create modules')
  }
  if (currentUser.role === 'project_manager') {
    const project = data.projectId ? await projectRepo.findById(data.projectId).catch(() => null) : null
    if (!project || project.managerId !== currentUser.id) throw new ForbiddenError('Access denied')
  }
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

export async function updateModule(moduleId: number, data: any, currentUser: { id: string; role: string }) {
  await assertModuleAccess(moduleId, currentUser, true)
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

export async function deleteModule(moduleId: number, currentUser: { id: string; role: string }) {
  await assertModuleAccess(moduleId, currentUser, true)
  await moduleRepo.remove(moduleId)
}

export async function getModuleNames() {
  return moduleRepo.selectNames()
}
