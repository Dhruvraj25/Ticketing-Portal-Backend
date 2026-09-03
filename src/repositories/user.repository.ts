import { db } from '../config/db'
import { user } from '../models/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import { normalizeEmail } from '../utils/email'

export type UserRow = {
  id: string
  name: string
  email: string
  role: string
  createdAt?: Date
  about?: string | null
  timezone?: string | null
  accountId?: string | null
  clientType?: string | null
  enableTeamsNotifications?: boolean
}
export type UserBrief = { id: string; name: string; email?: string; role?: string }

/** Single user lookup — used by auth/permission checks. */
export async function findByPk(id: string): Promise<UserRow | null> {
  const [row] = await db
    .select({
      id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt,
      about: user.about, timezone: user.timezone, accountId: user.accountId, clientType: user.clientType,
      enableTeamsNotifications: user.enableTeamsNotifications,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1)
  return row ?? null
}

/** Batch user lookup for name resolution. */
export async function findByIds(ids: string[]): Promise<UserBrief[]> {
  if (ids.length === 0) return []
  return db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(inArray(user.id, ids))
}

export async function findClients(): Promise<{ id: string; name: string; email: string }[]> {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.role, 'client'))
    .orderBy(user.name)
}

export async function findManagers(): Promise<{ id: string; name: string; email: string }[]> {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.role, 'project_manager'))
    .orderBy(user.name)
}

export async function findByRole(role: string): Promise<UserBrief[]> {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.role, role))
}

/**
 * Case-insensitive email lookup. Emails identify a user regardless of casing:
 * User@Company.com === user@company.com.
 */
export async function findByEmail(email: string): Promise<{ id: string } | null> {
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`LOWER(${user.email}) = ${normalized}`)
    .limit(1)
  return row ?? null
}

/** Find all client users that belong to the same organization (accountId). */
export async function findByAccountId(accountId: string): Promise<{ id: string; email: string; name: string; clientType: string | null; role: string; enableTeamsNotifications: boolean }[]> {
  return db
    .select({
      id: user.id, email: user.email, name: user.name, clientType: user.clientType,
      role: user.role, enableTeamsNotifications: user.enableTeamsNotifications,
    })
    .from(user)
    .where(sql`${user.accountId} = ${accountId} AND ${user.role} = 'client'`)
}

/** Update user profile fields (about, timezone, etc.). */
export async function updateProfile(userId: string, data: Record<string, unknown>) {
  const [row] = await db
    .update(user)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning({
      id: user.id, name: user.name, email: user.email, role: user.role,
      about: user.about, timezone: user.timezone, accountId: user.accountId, clientType: user.clientType,
      createdAt: user.createdAt,
    })
  return row ?? null
}