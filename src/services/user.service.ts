import * as userRepo from '../repositories/user.repository'
import { assertFound } from '../utils/errors'

export type AuthenticatedUser = { id: string; name: string; email: string; role: string }

/**
 * Resolve the current user from session info.
 * Cached per-request via React.cache equivalent if called multiple times.
 */
export async function getCurrentUser(userInfo: { id: string; name: string; email: string; role: string }) {
  const u = await userRepo.findByPk(userInfo.id)
  assertFound(u, 'User not found')
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
  }
}

export async function getDeveloperList() {
  return userRepo.findByRole('developer')
}

export async function getClientList() {
  return userRepo.findClients()
}

export async function getManagerList() {
  return userRepo.findManagers()
}

/**
 * Resolve user names for a set of IDs.
 */
export async function resolveUserNames(ids: string[]) {
  if (ids.length === 0) return new Map<string, string>()
  const users = await userRepo.findByIds(ids)
  return new Map(users.map(u => [u.id, u.name]))
}
