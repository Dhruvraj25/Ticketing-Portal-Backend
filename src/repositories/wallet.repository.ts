import { db } from '../config/db'
import { supportWallet, walletTransaction, walletAlert } from '../models/schema'
import { and, eq, desc, count, inArray, lte, gte, isNull } from 'drizzle-orm'

export async function findMany(conditions: any[]) {
  return db
    .select({
      id: supportWallet.id, clientId: supportWallet.clientId, projectId: supportWallet.projectId,
      totalPurchasedHours: supportWallet.totalPurchasedHours,
      reservedHours: supportWallet.reservedHours, consumedHours: supportWallet.consumedHours,
      remainingHours: supportWallet.remainingHours,
      contractStartDate: supportWallet.contractStartDate,
      contractEndDate: supportWallet.contractEndDate,
      status: supportWallet.status, createdAt: supportWallet.createdAt,
      updatedAt: supportWallet.updatedAt,
    })
    .from(supportWallet)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supportWallet.updatedAt))
}

export async function findById(id: number) {
  const [row] = await db
    .select({
      id: supportWallet.id, clientId: supportWallet.clientId, projectId: supportWallet.projectId,
      totalPurchasedHours: supportWallet.totalPurchasedHours,
      reservedHours: supportWallet.reservedHours, consumedHours: supportWallet.consumedHours,
      remainingHours: supportWallet.remainingHours,
      contractStartDate: supportWallet.contractStartDate,
      contractEndDate: supportWallet.contractEndDate,
      status: supportWallet.status, createdAt: supportWallet.createdAt,
      updatedAt: supportWallet.updatedAt,
    })
    .from(supportWallet).where(eq(supportWallet.id, id)).limit(1)
  return row ?? null
}

export async function update(id: number, data: Record<string, unknown>) {
  const [row] = await db.update(supportWallet).set(data).where(eq(supportWallet.id, id)).returning()
  return row
}

export async function insertTransaction(data: any) {
  await db.insert(walletTransaction).values(data)
}

export async function findTransactions(walletId: number) {
  return db
    .select({
      id: walletTransaction.id, walletId: walletTransaction.walletId,
      transactionType: walletTransaction.transactionType, hours: walletTransaction.hours,
      previousBalance: walletTransaction.previousBalance,
      newBalance: walletTransaction.newBalance,
      reason: walletTransaction.reason, remarks: walletTransaction.remarks,
      performedBy: walletTransaction.performedBy,
      performedAt: walletTransaction.performedAt,
      validFrom: walletTransaction.validFrom, validTo: walletTransaction.validTo,
    })
    .from(walletTransaction)
    .where(eq(walletTransaction.walletId, walletId))
    .orderBy(desc(walletTransaction.performedAt))
}

export async function findAll() {
  return db
    .select({
      id: supportWallet.id, clientId: supportWallet.clientId, projectId: supportWallet.projectId,
      totalPurchasedHours: supportWallet.totalPurchasedHours,
      reservedHours: supportWallet.reservedHours, consumedHours: supportWallet.consumedHours,
      remainingHours: supportWallet.remainingHours,
      contractStartDate: supportWallet.contractStartDate,
      contractEndDate: supportWallet.contractEndDate,
      status: supportWallet.status, createdAt: supportWallet.createdAt,
      updatedAt: supportWallet.updatedAt,
    })
    .from(supportWallet)
    .orderBy(desc(supportWallet.updatedAt))
}

export async function findLowBalance(threshold: number) {
  return db
    .select({
      id: supportWallet.id, clientId: supportWallet.clientId, projectId: supportWallet.projectId,
      totalPurchasedHours: supportWallet.totalPurchasedHours,
      reservedHours: supportWallet.reservedHours, consumedHours: supportWallet.consumedHours,
      remainingHours: supportWallet.remainingHours,
      contractStartDate: supportWallet.contractStartDate,
      contractEndDate: supportWallet.contractEndDate,
      status: supportWallet.status,
    })
    .from(supportWallet)
    .where(lte(supportWallet.remainingHours, threshold))
    .orderBy(supportWallet.remainingHours)
}

export async function findActiveAlerts() {
  return db
    .select({
      id: walletAlert.id, walletId: walletAlert.walletId,
      alertType: walletAlert.alertType, message: walletAlert.message,
      createdAt: walletAlert.createdAt, resolvedAt: walletAlert.resolvedAt,
    })
    .from(walletAlert)
    .where(isNull(walletAlert.resolvedAt))
    .orderBy(desc(walletAlert.createdAt))
    .limit(20)
}

export async function findTicketsByProjectAndClient(projectId: number, clientId: string) {
  const { ticket } = await import('../models/schema')
  const { desc: d } = await import('drizzle-orm')
  return db
    .select({
      id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title,
      estimatedHours: ticket.estimatedHours, status: ticket.status,
      createdAt: ticket.createdAt,
    })
    .from(ticket)
    .where(and(eq(ticket.projectId, projectId), eq(ticket.clientId, clientId)))
    .orderBy(d(ticket.createdAt))
}
