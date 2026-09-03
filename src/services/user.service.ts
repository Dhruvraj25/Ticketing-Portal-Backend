import * as userRepo from '../repositories/user.repository'
import { assertFound } from '../utils/errors'
import { BadRequestError } from '../utils/errors'

export type AuthenticatedUser = { id: string; name: string; email: string; role: string }

/**
 * Resolve the current user from session info.
 * Only the user id is required — profile fields are loaded from the database.
 */
export async function getCurrentUser(userInfo: { id: string }) {
  const u = await userRepo.findByPk(userInfo.id)
  assertFound(u, 'User not found')
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
    about: u.about ?? null,
    timezone: u.timezone ?? null,
    accountId: u.accountId ?? null,
    clientType: u.clientType ?? null,
    enableTeamsNotifications: u.enableTeamsNotifications ?? false,
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

// ─── Client Tenant Access ──────────────────────────────────────────────────
// Business model: each client organization has one Client Approver and
// multiple Standard Client users. A ticket created by any member of the org is
// visible to the whole org (creator + approver + other standard clients).
// Cross-organization access is blocked.

/**
 * Resolve the set of client user IDs a client viewer may access.
 *
 * - Clients with an accountId: every client user of the same organization.
 * - Clients without an accountId (legacy rows): only themselves.
 */
export async function getAccessibleClientIds(user: { id: string; role: string; accountId?: string | null }): Promise<string[]> {
  if (user.role !== 'client') return []
  if (user.accountId) {
    const members = await userRepo.findByAccountId(user.accountId)
    const ids = members.map(m => m.id)
    // Always include the viewer even if the org lookup misses them.
    return ids.includes(user.id) ? ids : [...ids, user.id]
  }
  return [user.id]
}

/**
 * Get the Client Approver(s) for a client user's organization.
 * Falls back to the user themselves when no org grouping exists.
 */
export async function getClientApprovers(user: { id: string; role: string; accountId?: string | null }): Promise<{ id: string; email: string; name: string; role: string; enableTeamsNotifications?: boolean }[]> {
  if (user.role !== 'client') return []
  const accountId = user.accountId
  if (!accountId) {
    const self = await userRepo.findByPk(user.id)
    return self ? [{ id: self.id, email: self.email, name: self.name, role: 'client', enableTeamsNotifications: self.enableTeamsNotifications ?? false }] : []
  }
  const members = await userRepo.findByAccountId(accountId)
  const approvers = members.filter(m => m.clientType === 'approver')
  const targets = approvers.length > 0 ? approvers : members
  return targets.map(m => ({ id: m.id, email: m.email, name: m.name, role: 'client', enableTeamsNotifications: m.enableTeamsNotifications ?? false }))
}

/**
 * Update the current user's profile (About / Timezone).
 * Persists to the database and returns the updated user row.
 */
export async function updateMyProfile(
  currentUser: AuthenticatedUser,
  data: { about?: string | null; timezone?: string | null },
) {
  const updateData: Record<string, unknown> = {}
  if (data.about !== undefined) {
    if (data.about !== null && typeof data.about === 'string' && data.about.length > 2000) {
      throw new BadRequestError('About must be at most 2000 characters.')
    }
    updateData.about = data.about ?? null
  }
  if (data.timezone !== undefined) {
    if (data.timezone !== null && typeof data.timezone === 'string' && data.timezone.trim().length > 64) {
      throw new BadRequestError('Timezone must be a valid IANA timezone identifier.')
    }
    updateData.timezone = data.timezone ? data.timezone.trim() : null
  }
  if (Object.keys(updateData).length === 0) {
    throw new BadRequestError('Nothing to update.')
  }

  const updated = await userRepo.updateProfile(currentUser.id, updateData)
  assertFound(updated, 'User not found')
  return updated
}