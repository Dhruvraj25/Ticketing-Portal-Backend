import { db } from '../config/db'
import { user } from '../models/schema'
import { eq, inArray } from 'drizzle-orm'

export type UserRow = { id: string; name: string; email: string; role: string; createdAt?: Date }
export type UserBrief = { id: string; name: string; email?: string; role?: string }

/** Single user lookup — used by auth/permission checks. Project only id, name, email, role. */
export async function findByPk(id: string): Promise<UserRow | null> {
  const [row] = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt })
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

export async function findByEmail(email: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email.trim()))
    .limit(1)
  return row ?? null
}
