import * as projectRepo from '../repositories/project.repository'
import * as moduleRepo from '../repositories/module.repository'
import * as ticketRepo from '../repositories/ticket.repository'
import * as userRepo from '../repositories/user.repository'
import { assertFound, assertAccess, BadRequestError, ForbiddenError } from '../utils/errors'
import { VALIDATION, validateField } from '../types/index'
import { getAccessibleClientIds } from './user.service'
import { inArray } from 'drizzle-orm'
import { project as projectTable } from '../models/schema'

function generateProjectCode(name: string): string {
  const prefix = name.split(/\s+/).map((w: string) => w[0]).join('').toUpperCase().slice(0, 6) || 'PRJ'
  const suffix = Date.now().toString(36).slice(-4).toUpperCase()
  return `${prefix}-${suffix}`
}

/**
 * Build permission conditions based on user role.
 * Clients see projects of their entire organization (client tenant).
 */
async function buildRoleConditions(user: { id: string; role: string; accountId?: string | null }) {
  const conds: any[] = []
  if (user.role === 'client') {
    const clientIds = await getAccessibleClientIds(user)
    conds.push(inArray(projectTable.clientId, clientIds))
  } else if (user.role === 'project_manager') {
    conds.push({ managerId: user.id })
  }
  return conds
}

export async function getProjectList(currentUser: { id: string; role: string; name: string; email: string }) {
  const user = await (await import('./user.service')).getCurrentUser(currentUser)
  const conditions = await buildRoleConditions(user)
  const rows = await projectRepo.findMany(conditions)
  if (rows.length === 0) return []

  const projectIds = rows.map(r => r.id)
  const [moduleCounts, ticketCounts] = await Promise.all([
    moduleRepo.countByProjectIds(projectIds),
    ticketRepo.countByProjectIds(projectIds),
  ])

  const moduleCountMap = new Map(moduleCounts.map(r => [r.projectId, Number(r.count) || 0]))
  const ticketCountMap = new Map(ticketCounts.map(r => [r.projectId, Number(r.count) || 0]))

  return rows.map(r => ({
    ...r,
    moduleCount: moduleCountMap.get(r.id) || 0,
    ticketCount: ticketCountMap.get(r.id) || 0,
  }))
}

export async function getProjectById(projectId: number, currentUser: { id: string; role: string }) {
  const p = await projectRepo.findById(projectId)
  assertFound(p, 'Project not found')
  if (currentUser.role === 'client') {
    const user = await (await import('./user.service')).getCurrentUser(currentUser)
    const clientIds = await getAccessibleClientIds(user)
    if (!clientIds.includes(p.clientId)) throw new ForbiddenError('Access denied')
  }
  if (currentUser.role === 'project_manager' && p.managerId !== currentUser.id) throw new ForbiddenError('Access denied')

  const [moduleCount, ticketCount] = await Promise.all([
    moduleRepo.countByProjectId(projectId),
    ticketRepo.countByProjectId(projectId),
  ])

  return { ...p, moduleCount, ticketCount }
}

export async function createProject(data: any, currentUser: { id: string; name: string; email: string; role: string }) {
  // Only admins and managers create projects. Never trust arbitrary IDs.
  if (currentUser.role !== 'admin' && currentUser.role !== 'project_manager') {
    throw new ForbiddenError('Only admins and managers can create projects')
  }
  const nameErr = validateField(data.projectName, VALIDATION.PROJECT_NAME_MAX_LENGTH, 'Project name')
  if (nameErr) throw new BadRequestError(nameErr)
  if (data.description) {
    const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
    if (descErr) throw new BadRequestError(descErr)
  }

  // Validate the client/manager targets by role — never accept arbitrary IDs.
  const client = data.clientId ? await userRepo.findByPk(data.clientId) : null
  if (!client || client.role !== 'client') throw new BadRequestError('Project client must be a client account')

  const manager = data.managerId ? await userRepo.findByPk(data.managerId) : null
  if (!manager || manager.role !== 'project_manager') throw new BadRequestError('Project manager must be a manager')

  const projectCode = generateProjectCode(data.projectName)
  return projectRepo.create({
    projectName: data.projectName,
    projectCode,
    clientId: data.clientId,
    managerId: data.managerId,
    description: data.description ?? null,
    startDate: data.startDate ?? null,
    status: 'active',
  })
}

export async function updateProject(projectId: number, data: any, currentUser: { id: string; role: string }) {
  const p = await projectRepo.findById(projectId)
  assertFound(p, 'Project not found')

  // Authorization: admins or the project's manager may update a project.
  if (currentUser.role !== 'admin' && !(currentUser.role === 'project_manager' && p.managerId === currentUser.id)) {
    throw new ForbiddenError('Access denied')
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (data.projectName !== undefined) {
    const nameErr = validateField(data.projectName, VALIDATION.PROJECT_NAME_MAX_LENGTH, 'Project name')
    if (nameErr) throw new BadRequestError(nameErr)
    updateData.projectName = data.projectName
  }
  if (data.description !== undefined) {
    if (data.description !== null) {
      const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
      if (descErr) throw new BadRequestError(descErr)
    }
    updateData.description = data.description
  }
  if (data.startDate !== undefined) updateData.startDate = data.startDate
  if (data.status !== undefined) updateData.status = data.status

  return projectRepo.update(projectId, updateData)
}

export async function archiveProject(projectId: number, currentUser: { id: string; role: string }) {
  const p = await projectRepo.findById(projectId)
  assertFound(p, 'Project not found')
  if (currentUser.role !== 'admin' && !(currentUser.role === 'project_manager' && p.managerId === currentUser.id)) {
    throw new ForbiddenError('Access denied')
  }
  return projectRepo.archive(projectId)
}

/**
 * Reassignment — change a project's client and/or manager.
 *
 * Rules:
 *   - Only admins, or the project's current manager, may reassign.
 *   - The new client must be an actual client account (role === 'client').
 *   - The new manager must be an actual manager (role === 'project_manager').
 *   - Arbitrary user IDs from the frontend are never trusted — the target
 *     users are validated against role and the project record.
 */
export async function reassignProject(
  projectId: number,
  data: { clientId?: string; managerId?: string },
  currentUser: { id: string; role: string },
) {
  const p = await projectRepo.findById(projectId)
  assertFound(p, 'Project not found')

  const isAdmin = currentUser.role === 'admin'
  const isCurrentManager = currentUser.role === 'project_manager' && p.managerId === currentUser.id
  if (!isAdmin && !isCurrentManager) {
    throw new ForbiddenError('Access denied')
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() }

  if (data.clientId !== undefined) {
    const client = await userRepo.findByPk(data.clientId)
    if (!client || client.role !== 'client') {
      throw new BadRequestError('Reassignment client must be a client account')
    }
    updateData.clientId = data.clientId
  }

  if (data.managerId !== undefined) {
    const manager = await userRepo.findByPk(data.managerId)
    if (!manager || manager.role !== 'project_manager') {
      throw new BadRequestError('Reassignment manager must be a manager')
    }
    updateData.managerId = data.managerId
  }

  if (Object.keys(updateData).length === 1) {
    throw new BadRequestError('Nothing to reassign')
  }

  return projectRepo.update(projectId, updateData)
}

/** Get all project names (lightweight, for dropdowns). */
export async function getProjectNames() {
  return projectRepo.selectNames()
}