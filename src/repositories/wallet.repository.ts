import { db } from '../config/db'
import { supportWallet, walletTransaction, walletAlert, project, ticket, module, user } from '../models/schema'
import { alias } from 'drizzle-orm/pg-core'
import { and, eq, desc, count, inArray, lte, gte, isNull, sql } from 'drizzle-orm'

// ─── Select helper — common columns returned for wallet queries ────────────
const walletColumns = {
  id: supportWallet.id,
  clientId: supportWallet.clientId,
  companyId: supportWallet.companyId,
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

// ─── Find the ONE wallet of a company ──────────────────────────────────────

/** The company's wallet (one per company — unique support_wallet.companyId). */
export async function findByCompanyId(companyId: number | null | undefined) {
  if (companyId == null) return null
  const [row] = await db
    .select(walletColumns)
    .from(supportWallet)
    .where(eq(supportWallet.companyId, companyId))
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

/** Wallets of the given companies (tenant-scoped). */
export async function findManyByCompanyIds(companyIds: number[]) {
  if (companyIds.length === 0) return []
  return db
    .select(walletColumns)
    .from(supportWallet)
    .where(inArray(supportWallet.companyId, companyIds))
    .orderBy(desc(supportWallet.updatedAt))
}

// ─── Create / Insert ───────────────────────────────────────────────────────

/**
 * Insert a new wallet row. Called by ensureWalletForClient after checking
 * that the company has no wallet yet (clientId = primary contact).
 */
export async function insert(data: {
  clientId: string
  companyId: number
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
    companyId: data.companyId,
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

/** Tickets drawing on a company's wallet: COALESCE(project owner's company, raiser's company). */
function ticketOfCompany(companyId: number) {
  const owner = alias(user, 'project_owner')
  const raiser = alias(user, 'ticket_raiser')
  return {
    owner,
    raiser,
    condition: sql`COALESCE(${owner.companyId}, ${raiser.companyId}) = ${companyId}`,
  }
}

/**
 * Find all tickets that have consumed hours from the company's wallet,
 * broken down by project. Used for usage-by-project reporting.
 */
export async function findTicketConsumptionByProject(companyId: number) {
  const scope = ticketOfCompany(companyId)
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
    .leftJoin(scope.owner, eq(scope.owner.id, project.clientId))
    .leftJoin(scope.raiser, eq(scope.raiser.id, ticket.clientId))
    .where(and(
      scope.condition,
      eq(ticket.status, 'closed'),
    ))
    .groupBy(ticket.projectId, project.projectName)
    .orderBy(desc(sql`COALESCE(SUM(${ticket.consumedHours}), 0)`))
}

/**
 * Find all tickets that have consumed hours from the company's wallet,
 * broken down by project and module. Used for detailed usage reporting.
 */
export async function findTicketConsumptionByModule(companyId: number) {
  const scope = ticketOfCompany(companyId)
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
    .leftJoin(scope.owner, eq(scope.owner.id, project.clientId))
    .leftJoin(scope.raiser, eq(scope.raiser.id, ticket.clientId))
    .where(and(
      scope.condition,
      eq(ticket.status, 'closed'),
    ))
    .groupBy(ticket.projectId, project.projectName, ticket.moduleId, module.moduleName)
    .orderBy(desc(sql`COALESCE(SUM(${ticket.consumedHours}), 0)`))
}

/** Every ticket that draws on the company's wallet (newest first). */
export async function findTicketsForCompany(companyId: number) {
  const scope = ticketOfCompany(companyId)
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
    .leftJoin(project, eq(ticket.projectId, project.id))
    .leftJoin(scope.owner, eq(scope.owner.id, project.clientId))
    .leftJoin(scope.raiser, eq(scope.raiser.id, ticket.clientId))
    .where(scope.condition)
    .orderBy(desc(ticket.createdAt))
}
