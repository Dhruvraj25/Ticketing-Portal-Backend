import { db } from '../config/db'
import { project, projectDeveloper } from '../models/schema'
import { and, eq, desc, count, inArray, isNotNull } from 'drizzle-orm'

export async function create(data: any) {
  const [row] = await db.insert(project).values(data).returning()
  return row
}

export async function findById(id: number) {
  const [row] = await db
    .select({
      id: project.id, projectName: project.projectName, projectCode: project.projectCode,
      clientId: project.clientId, managerId: project.managerId,
      description: project.description, startDate: project.startDate, endDate: project.endDate,
      status: project.status, createdAt: project.createdAt, updatedAt: project.updatedAt,
    })
    .from(project).where(eq(project.id, id)).limit(1)
  return row ?? null
}

export async function findMany(conditions: any[]) {
  return db
    .select({
      id: project.id, projectName: project.projectName, projectCode: project.projectCode,
      clientId: project.clientId, managerId: project.managerId,
      description: project.description, startDate: project.startDate, endDate: project.endDate,
      status: project.status, createdAt: project.createdAt, updatedAt: project.updatedAt,
    })
    .from(project)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(project.createdAt))
}

export async function update(id: number, data: Record<string, unknown>) {
  const [row] = await db.update(project).set(data).where(eq(project.id, id)).returning()
  return row
}

export async function archive(id: number) {
  const [row] = await db.update(project).set({ status: 'archived', updatedAt: new Date() }).where(eq(project.id, id)).returning()
  return row
}

export async function selectNames() {
  return db
    .select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode })
    .from(project)
}

export async function findDuplicate(name: string, clientId: string) {
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.projectName, name.trim()), eq(project.clientId, clientId)))
    .limit(1)
  return row ?? null
}

export async function activeCount() {
  const [row] = await db
    .select({ count: count() })
    .from(project)
    .where(eq(project.status, 'active'))
  return Number(row?.count) || 0
}

export async function kpiCounts() {
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      active: sql<number>`COUNT(*) FILTER (WHERE ${project.status} = 'active')::int`,
    })
    .from(project)
  return row
}

export async function findByClientId(clientId: string) {
  return db
    .select({
      id: project.id, projectName: project.projectName, projectCode: project.projectCode,
      clientId: project.clientId, managerId: project.managerId,
      description: project.description, startDate: project.startDate, endDate: project.endDate,
      status: project.status, createdAt: project.createdAt, updatedAt: project.updatedAt,
    })
    .from(project).where(eq(project.clientId, clientId))
}

// ─── Project-Developer junction ───────────────────────────────────────────

export async function findDeveloperIds(projectId: number) {
  const rows = await db
    .select({ userId: projectDeveloper.userId })
    .from(projectDeveloper)
    .where(eq(projectDeveloper.projectId, projectId))
  return rows.map(r => r.userId)
}

export async function addDeveloper(projectId: number, userId: string) {
  const [row] = await db.insert(projectDeveloper).values({ projectId, userId }).returning()
  return row
}

export async function removeDeveloper(projectId: number, userId: string) {
  await db
    .delete(projectDeveloper)
    .where(and(eq(projectDeveloper.projectId, projectId), eq(projectDeveloper.userId, userId)))
}

import { sql } from 'drizzle-orm'
