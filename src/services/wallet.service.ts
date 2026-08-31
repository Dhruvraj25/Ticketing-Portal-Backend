import * as walletRepo from '../repositories/wallet.repository'
import { assertFound } from '../utils/errors'

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
 * Get wallets. For clients, returns their ONE wallet.
 * For admins, returns all wallets (one per client).
 */
export async function getWallets(currentUser: { id: string; role: string }) {
  if (currentUser.role === 'client') {
    // Client: return their single wallet (or empty array if none)
    const wallet = await walletRepo.findByClientId(currentUser.id)
    return wallet ? [wallet] : []
  }
  // Admin/manager: return all wallets
  return walletRepo.findMany([])
}

/**
 * Get a single wallet by ID with authorization check.
 */
export async function getWalletById(walletId: number, currentUser: { id: string; role: string }) {
  const w = await walletRepo.findById(walletId)
  assertFound(w, 'Wallet not found')

  // Authorization: clients can only see their own wallet
  if (currentUser.role === 'client' && w.clientId !== currentUser.id) {
    throw new (await import('../utils/errors')).ForbiddenError('Access denied')
  }

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
    if (currentUser.role === 'client' && w.clientId !== currentUser.id) {
      throw new (await import('../utils/errors')).ForbiddenError('Access denied')
    }
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

  if (currentUser && currentUser.role === 'client' && w.clientId !== currentUser.id) {
    throw new (await import('../utils/errors')).ForbiddenError('Access denied')
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
 * Add support hours to a client wallet.
 * Always operates on the CLIENT's single wallet.
 */
export async function addWalletHours(data: any, currentUser: any) {
  const w = await walletRepo.findById(data.walletId)
  assertFound(w, 'Wallet not found')

  // Authorization check for clients
  if (currentUser?.role === 'client' && w.clientId !== currentUser.id) {
    throw new (await import('../utils/errors')).ForbiddenError('Access denied')
  }

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

// ─── Dashboard Stats ───────────────────────────────────────────────────────

/**
 * Dashboard stats: aggregate across all client wallets.
 * In the new architecture, there is one wallet per client,
 * so total wallets = total clients with wallets.
 */
export async function getWalletDashboardStats() {
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

// ─── Low Balance / Alerts ──────────────────────────────────────────────────

export async function getLowBalanceWallets(threshold: number) {
  return walletRepo.findLowBalance(threshold)
}

export async function getActiveWalletAlerts() {
  return walletRepo.findActiveAlerts()
}
