import { db } from '../../config/db'
import { supportWallet, walletTransaction, project, ticket, module, user, company } from '../../models/schema'
import { and, eq, desc, count, inArray, gte, lte, sum, sql } from 'drizzle-orm'
import type { ReportFilters, ReportResult } from './types'
import { getDateRange } from './utils'
import { companyIdOfUser, companyIdsManagedBy } from '../../lib/company-wallet'

/**
 * Company-wallet scope: client → their company's wallet; project manager →
 * wallets of companies whose projects they manage; admin → all. A client
 * filter means that client's company wallet. null = nothing visible.
 */
async function walletScopeConditions(currentUser: { id: string; role: string }, filters: ReportFilters): Promise<any[] | null> {
  const conditions: any[] = []
  if (currentUser.role === 'client') {
    const own = await companyIdOfUser(currentUser.id)
    if (own == null) return null
    conditions.push(eq(supportWallet.companyId, own))
  } else if (currentUser.role === 'project_manager') {
    const managed = await companyIdsManagedBy(currentUser.id)
    if (managed.length === 0) return null
    conditions.push(inArray(supportWallet.companyId, managed))
  } else if (currentUser.role !== 'admin') {
    return null
  }
  if (filters.clientId) {
    const filterCompanyId = await companyIdOfUser(filters.clientId)
    if (filterCompanyId == null) return null
    conditions.push(eq(supportWallet.companyId, filterCompanyId))
  }
  return conditions
}

/**
 * Get wallet IDs visible to the current user (one wallet per company).
 */
async function getVisibleWalletIds(currentUser: { id: string; role: string }, filters: ReportFilters): Promise<number[]> {
  const conditions = await walletScopeConditions(currentUser, filters)
  if (conditions === null) return []
  const wallets = await db
    .select({ id: supportWallet.id })
    .from(supportWallet)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
  return wallets.map(w => w.id)
}

/**
 * Support Wallet Report — One row per company wallet.
 * Each company has exactly ONE wallet, shared by all of its client users.
 */
export async function getSupportWalletReport(filters: ReportFilters, currentUser: { id: string; role: string }): Promise<ReportResult> {
  const scope = await walletScopeConditions(currentUser, filters)
  const conditions: any[] = scope ?? []

  const wallets = scope === null ? [] : await db
    .select({
      id: supportWallet.id,
      clientId: supportWallet.clientId,
      companyName: company.name,
      totalPurchasedHours: supportWallet.totalPurchasedHours,
      consumedHours: supportWallet.consumedHours,
      remainingHours: supportWallet.remainingHours,
      status: supportWallet.status,
    })
    .from(supportWallet)
    .leftJoin(company, eq(company.id, supportWallet.companyId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  const totalPurchased = wallets.reduce((s, w) => s + Number(w.totalPurchasedHours), 0)
  const totalConsumed = wallets.reduce((s, w) => s + Number(w.consumedHours), 0)
  const totalRemaining = wallets.reduce((s, w) => s + Number(w.remainingHours), 0)

  // For client name resolution, we need to join with user table
  const clientIds = wallets.map(w => w.clientId)
  const clients = clientIds.length > 0
    ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, clientIds))
    : []
  const clientMap = new Map(clients.map(c => [c.id, c.name]))

  return {
    meta: {
      totalRecords: wallets.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: {
        'Total Company Wallets': wallets.length,
        'Total Purchased': `${totalPurchased}h`,
        'Total Consumed': `${totalConsumed}h`,
        'Total Remaining': `${totalRemaining}h`,
      },
    },
    columns: [
      { key: 'clientName', label: 'Company', type: 'text' },
      { key: 'totalPurchasedHours', label: 'Purchased', type: 'number' },
      { key: 'consumedHours', label: 'Consumed', type: 'number' },
      { key: 'remainingHours', label: 'Remaining', type: 'number' },
      { key: 'status', label: 'Status', type: 'badge' },
    ],
    data: wallets.map(w => ({
      clientName: w.companyName || clientMap.get(w.clientId) || w.clientId,
      totalPurchasedHours: w.totalPurchasedHours,
      consumedHours: w.consumedHours,
      remainingHours: w.remainingHours,
      status: w.status,
    })),
    charts: [{
      type: 'bar',
      title: 'Remaining Hours per Company Wallet',
      data: wallets.map(w => ({
        name: w.companyName || clientMap.get(w.clientId) || `Company`,
        value: Number(w.remainingHours),
      })),
    }],
  }
}

/**
 * Reusable wallet transaction fetcher — all transaction reports
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
      remarks: walletTransaction.remarks,
    })
    .from(walletTransaction)
    .where(and(
      inArray(walletTransaction.walletId, walletIds),
      gte(walletTransaction.performedAt, since),
      lte(walletTransaction.performedAt, until),
    ))
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
    meta: {
      totalRecords: rows.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: { 'Total Transactions': rows.length },
    },
    columns: [
      { key: 'transactionType', label: 'Type', type: 'badge' },
      { key: 'hours', label: 'Hours', type: 'number' },
      { key: 'performedAt', label: 'Date', type: 'date' },
      { key: 'reason', label: 'Reason', type: 'text' },
    ],
    data: rows.map(r => {
      // Try to extract project/module from remarks JSON
      let projectInfo = ''
      try {
        const remarks = r.remarks ? JSON.parse(r.remarks) : null
        if (remarks?.projectId) projectInfo = `Project #${remarks.projectId}`
        if (remarks?.moduleId) projectInfo += ` / Module #${remarks.moduleId}`
      } catch { /* not JSON */ }
      return {
        transactionType: r.transactionType,
        hours: r.hours,
        performedAt: r.performedAt.toISOString(),
        reason: r.reason || projectInfo || '',
      }
    }),
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
    meta: {
      totalRecords: rows.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: [],
      summary: { 'Total Transactions': rows.length, 'Total Hours Added': totalAdded, 'Total Hours Used': totalUsed },
    },
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'added', label: 'Hours Added', type: 'number' },
      { key: 'used', label: 'Hours Used', type: 'number' },
      { key: 'balance', label: 'Balance', type: 'number' },
    ],
    data: (() => {
      let bal = 0
      return [...rows].sort((a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime()).map(r => {
        if (isAdd(r)) bal += r.hours
        else if (isDeduct(r)) bal -= r.hours
        return {
          date: r.performedAt.toISOString().split('T')[0],
          added: isAdd(r) ? r.hours : 0,
          used: isDeduct(r) ? r.hours : 0,
          balance: bal,
        }
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
    meta: {
      totalRecords: rows.length,
      generatedAt: new Date().toISOString(),
      appliedFilters: Object.entries(filters).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')),
      summary: { 'Total Transactions': rows.length, 'Total Hours Added': totalAdded, 'Total Hours Used': totalUsed },
    },
    columns: [
      { key: 'transactionType', label: 'Type', type: 'badge' },
      { key: 'hours', label: 'Hours', type: 'number' },
      { key: 'performedAt', label: 'Date', type: 'date' },
      { key: 'reason', label: 'Reason', type: 'text' },
    ],
    data: rows.map(r => {
      let projectInfo = ''
      try {
        const remarks = r.remarks ? JSON.parse(r.remarks) : null
        if (remarks?.projectId) projectInfo = `Project #${remarks.projectId}`
        if (remarks?.moduleId) projectInfo += ` / Module #${remarks.moduleId}`
      } catch { /* not JSON */ }
      return {
        transactionType: r.transactionType,
        hours: r.hours,
        performedAt: r.performedAt.toISOString(),
        reason: r.reason || projectInfo || '',
      }
    }),
  }
}
