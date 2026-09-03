import * as projectService from '../services/project.service'
import { wrapController } from '../lib/performance-profiler'
import type { AuthenticatedUser } from '../services/user.service'

export const getProjects = wrapController('getProjects', async (currentUser: AuthenticatedUser) =>
  projectService.getProjectList(currentUser))

export const getProjectById = wrapController('getProjectById', async (projectId: number, currentUser: AuthenticatedUser) =>
  projectService.getProjectById(projectId, currentUser))

export const createProject = wrapController('createProject', async (data: any, currentUser: AuthenticatedUser) =>
  projectService.createProject(data, currentUser))

export const updateProject = wrapController('updateProject', async (projectId: number, data: any, currentUser: AuthenticatedUser) =>
  projectService.updateProject(projectId, data, currentUser))

export const archiveProject = wrapController('archiveProject', async (projectId: number, currentUser: AuthenticatedUser) =>
  projectService.archiveProject(projectId, currentUser))

export const reassignProject = wrapController('reassignProject', async (projectId: number, data: { clientId?: string; managerId?: string }, currentUser: AuthenticatedUser) =>
  projectService.reassignProject(projectId, data, currentUser))