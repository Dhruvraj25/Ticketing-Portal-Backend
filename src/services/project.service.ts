import * as projectRepo from '../repositories/project.repository'
import * as moduleRepo from '../repositories/module.repository'
import * as ticketRepo from '../repositories/ticket.repository'
import * as userRepo from '../repositories/user.repository'
import { assertFound, assertAccess, BadRequestError } from '../utils/errors'
import { VALIDATION, validateField } from '../types/index'

function generateProjectCode(name: string): string {
  const prefix = name.split(/\s+/).map((w: string) => w[0]).join('').toUpperCase().slice(0, 6) || 'PRJ'
  const suffix = Date.now().toString(36).slice(-4).toUpperCase()
  return `${prefix}-${suffix}`
}

/**
 * Build permission conditions based on user role.
 */
function buildRoleConditions(user: { id: string; role: string }) {
  const conds: any[] = []
  if (user.role === 'client') conds.push({ clientId: user.id })
  else if (user.role === 'project_manager') conds.push({ managerId: user.id })
  return conds
}

export async function getProjectList(currentUser: { id: string; role: string; name: string; email: string }) {
  const user = await (await import('./user.service')).getCurrentUser(currentUser)
  const conditions = buildRoleConditions(user)
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
  if (currentUser.role === 'client' && p.clientId !== currentUser.id) throw new (await import('../utils/errors')).ForbiddenError('Access denied')
  if (currentUser.role === 'project_manager' && p.managerId !== currentUser.id) throw new (await import('../utils/errors')).ForbiddenError('Access denied')

  const [moduleCount, ticketCount] = await Promise.all([
    moduleRepo.countByProjectId(projectId),
    ticketRepo.countByProjectId(projectId),
  ])

  return { ...p, moduleCount, ticketCount }
}

export async function createProject(data: any, currentUser: { id: string; name: string; email: string; role: string }) {
  const nameErr = validateField(data.projectName, VALIDATION.PROJECT_NAME_MAX_LENGTH, 'Project name')
  if (nameErr) throw new BadRequestError(nameErr)
  if (data.description) {
    const descErr = validateField(data.description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Description')
    if (descErr) throw new BadRequestError(descErr)
  }

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

export async function updateProject(projectId: number, data: any) {
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

export async function archiveProject(projectId: number) {
  return projectRepo.archive(projectId)
}

/** Get all project names (lightweight, for dropdowns). */
export async function getProjectNames() {
  return projectRepo.selectNames()
}
