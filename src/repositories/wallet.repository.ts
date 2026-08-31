import { db } from '../config/db'
import { supportWallet, walletTransaction, walletAlert, project, ticket, module } from '../models/schema'
import { and, eq, desc, count, inArray, lte, gte, isNull, sql } from 'drizzle-orm'

// ─── Select helper — common columns returned for wallet queries ────────────
const walletColumns = {
  id: supportWallet.id,
  clientId: supportWallet.clientId,
  projectId: supportWallet.projectId,
  totalPurchasedHours: supportWallet.totalPurchasedHours,
  reservedHours: supportWallet.reservedHours,
  consumedHours: supportWallet.consumedHours,
  remainingHours: supportWallet.remainingHours,
  contractStartDate: supportWallet.contractStartDate,
  contractEndDate: supportWallet.contractEndDate,
  status: supportWallet.status,
  createdAt: supportWallet.createdAt,
  updatedAt: supportWallet.updatedAt,
}

// ─── Find by primary key ───────────────────────────────────────────────────

export async function findById(id: number) {
  const [row] = await db
    .select(walletColumns)
    .from(supportWallet)
    .where(eq(supportWallet.id, id))
    .limit(1)
  return row ?? null
}

// ─── Find the ONE wallet for a client ──────────────────────────────────────

/**
 * Returns the active or inactive wallet for a client.
 * In the one-wallet-per-client architecture, there should be exactly one.
 * Falls back to any wallet (including suspended/expired) if no active one exists.
 */
export async function findByClientId(clientId: string) {
  // Prefer active wallet first, then inactive, then any
  const [row] = await db
    .select(walletColumns)
    .from(supportWallet)
    .where(eq(supportWallet.clientId, clientId))
    .orderBy(
      // Priority: active > inactive > suspended > expired
      sql`CASE ${supportWallet.status} WHEN 'active' THEN 0 WHEN 'inactive' THEN 1 WHEN 'suspended' THEN 2 WHEN 'expired' THEN 3 ELSE 4 END`,
      desc(supportWallet.updatedAt),
    )
    .limit(1)
  return row ?? null
}

/**
 * Find wallet for client with specific status.
 */
export async function findByClientIdAndStatus(clientId: string, status: string) {
  const [row] = await db
    .select(walletColumns)
    .from(supportWallet)
    .where(and(eq(supportWallet.clientId, clientId), eq(supportWallet.status, status)))
    .limit(1)
  return row ?? null
}

// ─── Find many (admin queries) ─────────────────────────────────────────────

export async function findMany(conditions: any[]) {
  return db
    .select(walletColumns)
    .from(supportWallet)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supportWallet.updatedAt))
}

export async function findAll() {
  return db
    .select(walletColumns)
    .from(supportWallet)
    .orderBy(desc(supportWallet.updatedAt))
}

// ─── Create / Insert ───────────────────────────────────────────────────────

/**
 * Insert a new wallet row. Called by ensureWalletForClient after checking
 * that no wallet exists for the given clientId.
 */
export async function insert(data: {
  clientId: string
  projectId?: number | null
  totalPurchasedHours?: number
  reservedHours?: number
  consumedHours?: number
  remainingHours?: number
  contractStartDate?: Date | string | null
  contractEndDate?: Date | string | null
  status?: string
}) {
  const formatDate = (d: Date | string | null | undefined): string | null => {
    if (!d) return null
    if (typeof d === 'string') return d
    return d.toISOString().split('T')[0]
  }

  const insertData: typeof supportWallet.$inferInsert = {
    clientId: data.clientId,
    projectId: data.projectId ?? null,
    totalPurchasedHours: data.totalPurchasedHours ?? 0,
    reservedHours: data.reservedHours ?? 0,
    consumedHours: data.consumedHours ?? 0,
    remainingHours: data.remainingHours ?? 0,
    contractStartDate: formatDate(data.contractStartDate),
    contractEndDate: formatDate(data.contractEndDate),
    status: data.status ?? 'inactive',
  }
  const [row] = await db.insert(supportWallet).values(insertData).returning()
  return row
}

// ─── Update ────────────────────────────────────────────────────────────────

export async function update(id: number, data: Record<string, unknown>) {
  const [row] = await db.update(supportWallet).set(data).where(eq(supportWallet.id, id)).returning()
  return row
}

// ─── Transactions ──────────────────────────────────────────────────────────

export async function insertTransaction(data: any) {
  await db.insert(walletTransaction).values(data)
}

export async function findTransactions(walletId: number) {
  return db
    .select({
      id: walletTransaction.id,
      walletId: walletTransaction.walletId,
      transactionType: walletTransaction.transactionType,
      hours: walletTransaction.hours,
      previousBalance: walletTransaction.previousBalance,
      newBalance: walletTransaction.newBalance,
      reason: walletTransaction.reason,
      remarks: walletTransaction.remarks,
      performedBy: walletTransaction.performedBy,
      performedAt: walletTransaction.performedAt,
      validFrom: walletTransaction.validFrom,
      validTo: walletTransaction.validTo,
    })
    .from(walletTransaction)
    .where(eq(walletTransaction.walletId, walletId))
    .orderBy(desc(walletTransaction.performedAt))
}

// ─── Alerts ────────────────────────────────────────────────────────────────

export async function findActiveAlerts() {
  return db
    .select({
      id: walletAlert.id,
      walletId: walletAlert.walletId,
      alertType: walletAlert.alertType,
      message: walletAlert.message,
      createdAt: walletAlert.createdAt,
      resolvedAt: walletAlert.resolvedAt,
    })
    .from(walletAlert)
    .where(isNull(walletAlert.resolvedAt))
    .orderBy(desc(walletAlert.createdAt))
    .limit(20)
}

// ─── Low balance ───────────────────────────────────────────────────────────

export async function findLowBalance(threshold: number) {
  return db
    .select(walletColumns)
    .from(supportWallet)
    .where(lte(supportWallet.remainingHours, threshold))
    .orderBy(supportWallet.remainingHours)
}

// ─── Ticket consumption (per project breakdown for a client wallet) ────────

/**
 * Find all tickets that have consumed hours from the client's wallet,
 * broken down by project. Used for usage-by-project reporting.
 */
export async function findTicketConsumptionByProject(clientId: string) {
  return db
    .select({
      projectId: ticket.projectId,
      projectName: project.projectName,
      ticketCount: count(ticket.id),
      totalEstimatedHours: sql<number>`COALESCE(SUM(${ticket.estimatedHours}), 0)::int`,
      totalConsumedHours: sql<number>`COALESCE(SUM(${ticket.consumedHours}), 0)::int`,
    })
    .from(ticket)
    .leftJoin(project, eq(ticket.projectId, project.id))
    .where(and(
      eq(ticket.clientId, clientId),
      eq(ticket.status, 'closed'),
    ))
    .groupBy(ticket.projectId, project.projectName)
    .orderBy(desc(sql`COALESCE(SUM(${ticket.consumedHours}), 0)`))
}

/**
 * Find all tickets that have consumed hours from the client's wallet,
 * broken down by project and module. Used for detailed usage reporting.
 */
export async function findTicketConsumptionByModule(clientId: string) {
  return db
    .select({
      projectId: ticket.projectId,
      projectName: project.projectName,
      moduleId: ticket.moduleId,
      moduleName: module.moduleName,
      ticketCount: count(ticket.id),
      totalEstimatedHours: sql<number>`COALESCE(SUM(${ticket.estimatedHours}), 0)::int`,
      totalConsumedHours: sql<number>`COALESCE(SUM(${ticket.consumedHours}), 0)::int`,
    })
    .from(ticket)
    .leftJoin(project, eq(ticket.projectId, project.id))
    .leftJoin(module, eq(ticket.moduleId, module.id))
    .where(and(
      eq(ticket.clientId, clientId),
      eq(ticket.status, 'closed'),
    ))
    .groupBy(ticket.projectId, project.projectName, ticket.moduleId, module.moduleName)
    .orderBy(desc(sql`COALESCE(SUM(${ticket.consumedHours}), 0)`))
}

/**
 * Find tickets for a specific project/client (backward compat for existing UI).
 */
export async function findTicketsByProjectAndClient(projectId: number, clientId: string) {
  return db
    .select({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      estimatedHours: ticket.estimatedHours,
      consumedHours: ticket.consumedHours,
      status: ticket.status,
      createdAt: ticket.createdAt,
    })
    .from(ticket)
    .where(and(eq(ticket.projectId, projectId), eq(ticket.clientId, clientId)))
    .orderBy(desc(ticket.createdAt))
}
