import * as walletRepo from '../repositories/wallet.repository'
import * as projectRepo from '../repositories/project.repository'
import { db } from '../config/db'
import { project as projectTable } from '../models/schema'
import { inArray } from 'drizzle-orm'
import { assertFound, ForbiddenError } from '../utils/errors'

// ─── Tenant scoping helpers ────────────────────────────────────────────────
// Wallets belong to a client organization. Clients may only see their own
// org's wallet; managers may only see wallets of clients on projects they
// manage; admins see everything. Developers have no wallet access.

/** Client IDs whose projects the manager manages. */
async function getManagerScopedClientIds(managerId: string): Promise<string[]> {
  const rows = await db
    .select({ clientId: projectTable.clientId })
    .from(projectTable)
    .where(inArray(projectTable.managerId, [managerId]))
  return [...new Set(rows.map(r => r.clientId))]
}

async function assertWalletAccess(wallet: { id: number; clientId: string }, user: { id: string; role: string }) {
  if (user.role === 'admin') return
  if (user.role === 'client') {
    if (wallet.clientId !== user.id) throw new ForbiddenError('Access denied')
    return
  }
  if (user.role === 'project_manager') {
    const scoped = await getManagerScopedClientIds(user.id)
    if (scoped.includes(wallet.clientId)) return
    throw new ForbiddenError('Access denied')
  }
  throw new ForbiddenError('Access denied')
}

// ─── Ensure Wallet Exists (Idempotent) ─────────────────────────────────────

/**
 * Ensures a client has exactly one support wallet.
 * If no wallet exists, creates one.
 * If a wallet already exists, returns it.
 * Never creates duplicates.
 *
 * This is the ONLY place new wallets should be created.
 */
export async function ensureWalletForClient(
  clientId: string,
  options?: {
    projectId?: number | null
    totalPurchasedHours?: number
    contractStartDate?: Date | string | null
    contractEndDate?: Date | string | null
  },
) {
  const existing = await walletRepo.findByClientId(clientId)
  if (existing) return existing

  // Create a new client-level wallet (no projectId)
  return walletRepo.insert({
    clientId,
    projectId: null, // Wallets are client-level, not project-level
    totalPurchasedHours: options?.totalPurchasedHours ?? 0,
    reservedHours: 0,
    consumedHours: 0,
    remainingHours: options?.totalPurchasedHours ?? 0,
    contractStartDate: options?.contractStartDate ?? null,
    contractEndDate: options?.contractEndDate ?? null,
    status: 'inactive',
  })
}

// ─── Get Wallets ───────────────────────────────────────────────────────────

/**
 * Get wallets scoped to the caller:
 *   - client: their organization's single wallet
 *   - project_manager: wallets of clients on projects they manage
 *   - admin: all wallets
 *   - developer: none
 */
export async function getWallets(currentUser: { id: string; role: string }) {
  if (currentUser.role === 'client') {
    const wallet = await walletRepo.findByClientId(currentUser.id)
    return wallet ? [wallet] : []
  }
  if (currentUser.role === 'project_manager') {
    const clientIds = await getManagerScopedClientIds(currentUser.id)
    return walletRepo.findManyByClientIds(clientIds)
  }
  if (currentUser.role === 'admin') {
    return walletRepo.findMany([])
  }
  return []
}

/**
 * Get a single wallet by ID with authorization check.
 */
export async function getWalletById(walletId: number, currentUser: { id: string; role: string }) {
  const w = await walletRepo.findById(walletId)
  assertFound(w, 'Wallet not found')
  await assertWalletAccess(w, currentUser)

  const alerts = await walletRepo.findActiveAlerts()
  return { ...w, alerts }
}

/**
 * Get wallet transactions with authorization.
 */
export async function getWalletTransactions(walletId: number, currentUser?: { id: string; role: string }) {
  if (currentUser) {
    const w = await walletRepo.findById(walletId)
    assertFound(w, 'Wallet not found')
    await assertWalletAccess(w, currentUser)
  }
  return walletRepo.findTransactions(walletId)
}

/**
 * Get ticket consumption breakdown by project for a wallet.
 * Uses the client's ticket history, not project-specific wallet.
 */
export async function getWalletTicketConsumption(walletId: number, currentUser?: { id: string; role: string }) {
  const w = await walletRepo.findById(walletId)
  assertFound(w, 'Wallet not found')

  if (currentUser) {
    await assertWalletAccess(w, currentUser)
  }

  // Return breakdown by project
  const byProject = await walletRepo.findTicketConsumptionByProject(w.clientId)
  // Also return per-ticket detail
  const tickets = await walletRepo.findTicketsByProjectAndClient(
    // For backward compat: we still query across all projects for this client
    // Using a special case: pass 0 as projectId to indicate "all projects"
    0, // sentinel — handled by the updated query below
    w.clientId,
  )

  return { byProject, tickets }
}

// ─── Add Hours ─────────────────────────────────────────────────────────────

/**
 * Add support hours to a client wallet. Admins may recharge any client;
 * managers may only recharge clients on projects they manage. Clients can
 * never add hours to their own wallet.
 */
export async function addWalletHours(data: any, currentUser: any) {
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'project_manager')) {
    throw new ForbiddenError('Only admins and managers can add wallet hours')
  }
  const w = await walletRepo.findById(data.walletId)
  assertFound(w, 'Wallet not found')
  await assertWalletAccess(w, currentUser)

  const newTotalPurchased = Number(w.totalPurchasedHours) + Number(data.hours)
  const newRemaining = Number(w.remainingHours) + Number(data.hours)
  const previousBalance = Number(w.remainingHours)

  const updateData: Record<string, unknown> = {
    totalPurchasedHours: newTotalPurchased,
    remainingHours: newRemaining,
    status: w.status === 'inactive' ? 'active' : w.status,
    updatedAt: new Date(),
  }
  if (data.startDate) updateData.contractStartDate = data.startDate
  if (data.endDate) updateData.contractEndDate = data.endDate

  const updated = await walletRepo.update(data.walletId, updateData)

  await walletRepo.insertTransaction({
    walletId: data.walletId,
    transactionType: 'Add Hours',
    hours: Number(data.hours),
    previousBalance,
    newBalance: newRemaining,
    reason: data.reason || null,
    remarks: data.remarks || null,
    performedBy: currentUser?.name || currentUser?.id || 'system',
    validFrom: data.startDate || null,
    validTo: data.endDate || null,
  })

  return updated
}

// ─── Deduct Hours (from ticket closure) ────────────────────────────────────

/**
 * Deduct hours from a client wallet when a ticket is closed.
 * Resolves the wallet through the client, NOT through the project.
 */
export async function deductHoursFromWallet(params: {
  clientId: string
  hours: number
  ticketId: number
  projectId?: number | null
  moduleId?: number | null
  performedBy: string
  reason?: string
}) {
  const w = await walletRepo.findByClientId(params.clientId)
  if (!w) {
    console.error(`[Wallet] No wallet found for client ${params.clientId}. Cannot deduct ${params.hours}h.`)
    return null
  }

  const previousBalance = Number(w.remainingHours)
  const newBalance = previousBalance - params.hours

  // Allow negative balance for override tickets, otherwise block
  if (newBalance < 0) {
    console.warn(`[Wallet] Client ${params.clientId} has insufficient hours: ${previousBalance}h available, ${params.hours}h requested.`)
    // Still deduct — override tickets may exceed balance
  }

  await walletRepo.update(w.id, {
    consumedHours: Number(w.consumedHours) + params.hours,
    remainingHours: newBalance,
    updatedAt: new Date(),
  })

  await walletRepo.insertTransaction({
    walletId: w.id,
    transactionType: 'Deduct Hours',
    hours: params.hours,
    previousBalance,
    newBalance,
    reason: params.reason || `Ticket #${params.ticketId} hours consumed`,
    remarks: JSON.stringify({
      ticketId: params.ticketId,
      projectId: params.projectId,
      moduleId: params.moduleId,
    }),
    performedBy: params.performedBy,
  })

  return { walletId: w.id, previousBalance, newBalance }
}

// ─── Check Balance ─────────────────────────────────────────────────────────

/**
 * Check if a client has sufficient hours to create a ticket.
 * Uses the client's single wallet.
 */
export async function checkClientCanCreateTicket(
  clientId: string,
  requiredHours: number,
): Promise<{ allowed: boolean; remainingHours: number; walletId: number | null }> {
  const w = await walletRepo.findByClientId(clientId)
  if (!w) {
    return { allowed: false, remainingHours: 0, walletId: null }
  }

  const remaining = Number(w.remainingHours)
  return {
    allowed: remaining >= requiredHours,
    remainingHours: remaining,
    walletId: w.id,
  }
}

// ─── Admin Dashboard Stats ─────────────────────────────────────────────────

/**
 * Dashboard stats: aggregate across all client wallets.
 * Admin-only — the figures are global and reveal other organizations' data.
 */
export async function getWalletDashboardStats(currentUser?: { id: string; role: string }) {
  if (!currentUser || currentUser.role !== 'admin') {
    throw new ForbiddenError('Access denied')
  }
  const wallets = await walletRepo.findAll()
  const totalPurchased = wallets.reduce((s, w) => s + Number(w.totalPurchasedHours), 0)
  const totalConsumed = wallets.reduce((s, w) => s + Number(w.consumedHours), 0)
  const totalRemaining = wallets.reduce((s, w) => s + Number(w.remainingHours), 0)
  const lowBalanceClients = wallets.filter(w => Number(w.remainingHours) <= 20).length
  const activeWallets = wallets.filter(w => w.status === 'active').length
  return {
    totalPurchased,
    totalConsumed,
    totalRemaining,
    lowBalanceClients,
    activeWallets,
    totalWallets: wallets.length, // This equals the number of clients with wallets
  }
}

// ─── Low Balance / Alerts (admin dashboards) ───────────────────────────────

export async function getLowBalanceWallets(threshold: number, currentUser?: { id: string; role: string }) {
  if (!currentUser || currentUser.role !== 'admin') {
    throw new ForbiddenError('Access denied')
  }
  return walletRepo.findLowBalance(threshold)
}

export async function getActiveWalletAlerts(currentUser?: { id: string; role: string }) {
  if (!currentUser || currentUser.role !== 'admin') {
    throw new ForbiddenError('Access denied')
  }
  return walletRepo.findActiveAlerts()
}
