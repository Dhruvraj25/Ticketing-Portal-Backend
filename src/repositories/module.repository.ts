import { db } from '../config/db'
import { module as moduleTable } from '../models/schema'
import { and, eq, desc, count, inArray } from 'drizzle-orm'

export async function create(data: any) {
  const [row] = await db.insert(moduleTable).values(data).returning()
  return row
}

export async function findById(id: number) {
  const [row] = await db
    .select({
      id: moduleTable.id, projectId: moduleTable.projectId,
      moduleName: moduleTable.moduleName, description: moduleTable.description,
      status: moduleTable.status, createdAt: moduleTable.createdAt,
      updatedAt: moduleTable.updatedAt,
    })
    .from(moduleTable).where(eq(moduleTable.id, id)).limit(1)
  return row ?? null
}

export async function findMany(conditions: any[]) {
  return db
    .select({
      id: moduleTable.id, projectId: moduleTable.projectId,
      moduleName: moduleTable.moduleName, description: moduleTable.description,
      status: moduleTable.status, createdAt: moduleTable.createdAt,
      updatedAt: moduleTable.updatedAt,
    })
    .from(moduleTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(moduleTable.createdAt))
}

export async function update(id: number, data: Record<string, unknown>) {
  const [row] = await db.update(moduleTable).set(data).where(eq(moduleTable.id, id)).returning()
  return row
}

export async function remove(id: number) {
  await db.delete(moduleTable).where(eq(moduleTable.id, id))
}

export async function countByProjectId(projectId: number) {
  const [row] = await db
    .select({ count: count() })
    .from(moduleTable)
    .where(eq(moduleTable.projectId, projectId))
  return Number(row?.count) || 0
}

export async function countByProjectIds(projectIds: number[]) {
  if (projectIds.length === 0) return []
  return db
    .select({ projectId: moduleTable.projectId, count: count() })
    .from(moduleTable)
    .where(inArray(moduleTable.projectId, projectIds))
    .groupBy(moduleTable.projectId)
}

export async function selectNames() {
  return db
    .select({ id: moduleTable.id, moduleName: moduleTable.moduleName })
    .from(moduleTable)
}

export async function findActiveWithProject() {
  return db
    .select({ id: moduleTable.id, moduleName: moduleTable.moduleName, projectId: moduleTable.projectId })
    .from(moduleTable)
    .where(eq(moduleTable.status, 'active'))
    .orderBy(moduleTable.moduleName)
}
