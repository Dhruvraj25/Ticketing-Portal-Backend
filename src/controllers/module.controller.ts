import * as moduleService from '../services/module.service'
import { wrapController } from '../lib/performance-profiler'
import type { AuthenticatedUser } from '../services/user.service'

export const getModules = wrapController('getModules', async (projectId: number | undefined, currentUser: AuthenticatedUser) =>
  moduleService.getModuleList(projectId, currentUser))

export const getModuleById = wrapController('getModuleById', async (moduleId: number, currentUser: AuthenticatedUser) =>
  moduleService.getModuleById(moduleId, currentUser))

export const createModule = wrapController('createModule', async (data: any, currentUser: AuthenticatedUser) =>
  moduleService.createModule(data, currentUser))

export const updateModule = wrapController('updateModule', async (moduleId: number, data: any, currentUser: AuthenticatedUser) =>
  moduleService.updateModule(moduleId, data, currentUser))

export const deleteModule = wrapController('deleteModule', async (moduleId: number, currentUser: AuthenticatedUser) =>
  moduleService.deleteModule(moduleId, currentUser))
