import { db } from '../../config/db'
import { supportWallet, walletTransaction, project } from '../../models/schema'
import { and, eq, desc, count, inArray, gte, lte, sum } from 'drizzle-orm'
import type { ReportFilters, ReportResult } from './types'
import { getDateRange } from './utils'

/**
 * Get wallet IDs visible to the current user based on their role.
 * Avoids duplicating this logic across 4 report functions.
 */
async function getVisibleWalletIds(currentUser: { id: string; role: string }, filters: ReportFilters): Promise<number[]> {
  const walletIds: Set<number> = new Set()

  if (currentUser.role === 'client') {
    const wallets = await db
      .select({ id: supportWallet.id })
      .from(supportWallet)
      .where(eq(supportWallet.clientId, currentUser.id))
    wallets.forEach(w => walletIds.add(w.id))
  }

  if (filters.clientId) {
    const wallets = await db
      .select({ id: supportWallet.id })
      .from(supportWallet)
      .where(eq(supportWallet.clientId, filters.clientId))
    wallets.forEach(w => walletIds.add(w.id))
  }

  // Admin or manager with no specific filter: see all wallets
  if (walletIds.size === 0 && currentUser.role !== 'client') {
    const wallets = await db
      .select({ id: supportWallet.id })
      .from(supportWallet)
    wallets.forEach(w => walletIds.add(w.id))
  }

  return [...walletIds]
}

export async function getSupportWalletReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const conditions: any[] = []
  if (currentUser.role === 'client') conditions.push(eq(supportWallet.clientId, currentUser.id))
  if (filters.clientId) conditions.push(eq(supportWallet.clientId, filters.clientId))

  // OPTIMIZED: Select only the 5 columns needed instead of SELECT *
  const wallets = await db
    .select({
      id: supportWallet.id,
      clientId: supportWallet.clientId,
      totalPurchasedHours: supportWallet.totalPurchasedHours,
      consumedHours: supportWallet.consumedHours,
      remainingHours: supportWallet.remainingHours,
      status: supportWallet.status,
    })
    .from(supportWallet)
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  const totalPurchased = wallets.reduce((s, w) => s + Number(w.totalPurchasedHours), 0)
  const totalConsumed = wallets.reduce((s, w) => s + Number(w.consumedHours), 0)
  const totalRemaining = wallets.reduce((s, w) => s + Number(w.remainingHours), 0)

  return {
    meta: { totalRecords: wallets.length, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { 'Total Wallets': wallets.length, 'Total Purchased': `${totalPurchased}h`, 'Total Consumed': `${totalConsumed}h`, 'Total Remaining': `${totalRemaining}h` } },
    columns: [{ key: 'clientId', label: 'Client', type: 'text' }, { key: 'totalPurchasedHours', label: 'Purchased', type: 'number' }, { key: 'consumedHours', label: 'Consumed', type: 'number' }, { key: 'remainingHours', label: 'Remaining', type: 'number' }, { key: 'status', label: 'Status', type: 'badge' }],
    data: wallets.map(w => ({ clientId: w.clientId, totalPurchasedHours: w.totalPurchasedHours, consumedHours: w.consumedHours, remainingHours: w.remainingHours, status: w.status })),
    charts: [{ type: 'bar', title: 'Remaining Hours per Wallet', data: wallets.map(w => ({ name: `Wallet #${w.id}`, value: Number(w.remainingHours) })) }],
  }
}

/**
 * Reusable wallet transaction fetcher — all 3 transaction reports
 * (getWalletTransactionReport, getWalletConsumptionReport, getWalletHistoryReport)
 * use this instead of duplicating the wallet-lookup logic.
 */
async function fetchWalletTransactions(
  walletIds: number[],
  since: Date,
  until: Date,
  limit: number = 200,
) {
  return db
    .select({
      id: walletTransaction.id,
      walletId: walletTransaction.walletId,
      transactionType: walletTransaction.transactionType,
      hours: walletTransaction.hours,
      performedAt: walletTransaction.performedAt,
      reason: walletTransaction.reason,
    })
    .from(walletTransaction)
    .where(and(inArray(walletTransaction.walletId, walletIds), gte(walletTransaction.performedAt, since), lte(walletTransaction.performedAt, until)))
    .orderBy(desc(walletTransaction.performedAt))
    .limit(limit)
}

export async function getWalletTransactionReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const walletIds = await getVisibleWalletIds(currentUser, filters)
  if (walletIds.length === 0) {
    return { meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: [], summary: {} }, columns: [], data: [] }
  }

  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const rows = await fetchWalletTransactions(walletIds, since, until, 200)

  return {
    meta: { totalRecords: rows.length, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { 'Total Transactions': rows.length } },
    columns: [{ key: 'transactionType', label: 'Type', type: 'badge' }, { key: 'hours', label: 'Hours', type: 'number' }, { key: 'performedAt', label: 'Date', type: 'date' }, { key: 'reason', label: 'Reason', type: 'text' }],
    data: rows.map(r => ({ transactionType: r.transactionType, hours: r.hours, performedAt: r.performedAt.toISOString(), reason: r.reason || '' })),
  }
}

async function getTransactionStats(rows: { transactionType: string; hours: number }[]) {
  const isAdd = (r: { transactionType: string }) => r.transactionType === 'Add Hours' || r.transactionType === 'Emergency Credit'
  const isDeduct = (r: { transactionType: string }) => r.transactionType === 'Deduct Hours'
  const totalAdded = rows.filter(isAdd).reduce((s, r) => s + r.hours, 0)
  const totalUsed = rows.filter(isDeduct).reduce((s, r) => s + r.hours, 0)
  return { totalAdded, totalUsed }
}

export async function getWalletConsumptionReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const walletIds = await getVisibleWalletIds(currentUser, filters)
  if (walletIds.length === 0) {
    return { meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: [], summary: {} }, columns: [], data: [] }
  }

  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const rows = await fetchWalletTransactions(walletIds, since, until, 500)

  const isAdd = (r: { transactionType: string }) => r.transactionType === 'Add Hours' || r.transactionType === 'Emergency Credit'
  const isDeduct = (r: { transactionType: string }) => r.transactionType === 'Deduct Hours'
  const { totalAdded, totalUsed } = await getTransactionStats(rows)

  return {
    meta: { totalRecords: rows.length, generatedAt: new Date().toISOString(), appliedFilters: [], summary: { 'Total Transactions': rows.length, 'Total Hours Added': totalAdded, 'Total Hours Used': totalUsed } },
    columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'added', label: 'Hours Added', type: 'number' }, { key: 'used', label: 'Hours Used', type: 'number' }, { key: 'balance', label: 'Balance', type: 'number' }],
    data: (() => {
      let bal = 0
      return [...rows].sort((a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime()).map(r => {
        if (isAdd(r)) bal += r.hours
        else if (isDeduct(r)) bal -= r.hours
        return { date: r.performedAt.toISOString().split('T')[0], added: isAdd(r) ? r.hours : 0, used: isDeduct(r) ? r.hours : 0, balance: bal }
      })
    })(),
  }
}

export async function getWalletHistoryReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const walletIds = await getVisibleWalletIds(currentUser, filters)
  if (walletIds.length === 0) {
    return { meta: { totalRecords: 0, generatedAt: new Date().toISOString(), appliedFilters: [], summary: {} }, columns: [], data: [] }
  }

  const { since, until } = getDateRange(filters.dateFrom, filters.dateTo)
  const rows = await fetchWalletTransactions(walletIds, since, until, 500)

  const { totalAdded, totalUsed } = await getTransactionStats(rows)

  return {
    meta: { totalRecords: rows.length, generatedAt: new Date().toISOString(), appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')), summary: { 'Total Transactions': rows.length, 'Total Hours Added': totalAdded, 'Total Hours Used': totalUsed } },
    columns: [{ key: 'transactionType', label: 'Type', type: 'badge' }, { key: 'hours', label: 'Hours', type: 'number' }, { key: 'performedAt', label: 'Date', type: 'date' }, { key: 'reason', label: 'Reason', type: 'text' }],
    data: rows.map(r => ({ transactionType: r.transactionType, hours: r.hours, performedAt: r.performedAt.toISOString(), reason: r.reason || '' })),
  }
}
