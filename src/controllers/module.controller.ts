import * as moduleService from '../services/module.service'
import { wrapController } from '../lib/performance-profiler'
import type { AuthenticatedUser } from '../services/user.service'

export const getModules = wrapController('getModules', async (projectId: number | undefined, currentUser: AuthenticatedUser) =>
  moduleService.getModuleList(projectId, currentUser))

export const getModuleById = wrapController('getModuleById', async (moduleId: number) =>
  moduleService.getModuleById(moduleId))

export const createModule = wrapController('createModule', async (data: any) =>
  moduleService.createModule(data))

export const updateModule = wrapController('updateModule', async (moduleId: number, data: any) =>
  moduleService.updateModule(moduleId, data))

export const deleteModule = wrapController('deleteModule', async (moduleId: number) =>
  moduleService.deleteModule(moduleId))
