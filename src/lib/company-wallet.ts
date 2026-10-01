// ============================================================================
// Company Support Wallet resolution (Backend mirror of
// Frontend/lib/company-wallet.ts + company-wallet-rules.ts)
// ============================================================================
// ONE company → ONE wallet (support_wallet.companyId, unique) → every client
// user of the company (user.companyId). A ticket's wallet is its company's:
// ticket → project → company (project.clientId's company), else the company
// of the client who raised it. support_wallet.clientId is only the wallet's
// primary contact and never decides access.
// ============================================================================

import { eq } from 'drizzle-orm'
import { db } from '../config/db'
import { project, user } from '../models/schema'

export async function companyIdOfUser(userId: string | null | undefined): Promise<number | null> {
  if (!userId) return null
  const [u] = await db.select({ companyId: user.companyId }).from(user).where(eq(user.id, userId)).limit(1)
  return u?.companyId ?? null
}

export async function companyIdOfProject(projectId: number | null | undefined): Promise<number | null> {
  if (!projectId) return null
  const [p] = await db
    .select({ companyId: user.companyId })
    .from(project)
    .innerJoin(user, eq(user.id, project.clientId))
    .where(eq(project.id, projectId))
    .limit(1)
  return p?.companyId ?? null
}

/** ticket → project → company (else the raiser's company). */
export async function companyIdForTicket(t: { clientId: string | null; projectId: number | null }): Promise<number | null> {
  return (await companyIdOfProject(t.projectId)) ?? (await companyIdOfUser(t.clientId))
}

/** Companies of the projects a manager manages. */
export async function companyIdsManagedBy(managerId: string): Promise<number[]> {
  const rows = await db
    .selectDistinct({ companyId: user.companyId })
    .from(project)
    .innerJoin(user, eq(user.id, project.clientId))
    .where(eq(project.managerId, managerId))
  return rows.map((r) => r.companyId).filter((id): id is number => id != null)
}
