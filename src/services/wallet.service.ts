import * as walletRepo from '../repositories/wallet.repository'
import { assertFound } from '../utils/errors'

export async function getWallets(currentUser: { id: string; role: string }) {
  const conditions: any[] = []
  if (currentUser.role === 'client') conditions.push({ clientId: currentUser.id })
  return walletRepo.findMany(conditions)
}

export async function getWalletById(walletId: number) {
  const w = await walletRepo.findById(walletId)
  assertFound(w, 'Wallet not found')
  const alerts = await (await import('../repositories/wallet.repository')).findActiveAlerts()
  return { ...w, alerts }
}

export async function getWalletTransactions(walletId: number) {
  return walletRepo.findTransactions(walletId)
}

export async function getWalletTicketConsumption(walletId: number) {
  const w = await walletRepo.findById(walletId)
  assertFound(w, 'Wallet not found')
  if (w.projectId === null) return []
  return walletRepo.findTicketsByProjectAndClient(w.projectId, w.clientId)
}

export async function addWalletHours(data: any, currentUser: any) {
  const w = await walletRepo.findById(data.walletId)
  assertFound(w, 'Wallet not found')

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

export async function getWalletDashboardStats() {
  const wallets = await walletRepo.findAll()
  const totalPurchased = wallets.reduce((s, w) => s + Number(w.totalPurchasedHours), 0)
  const totalConsumed = wallets.reduce((s, w) => s + Number(w.consumedHours), 0)
  const totalRemaining = wallets.reduce((s, w) => s + Number(w.remainingHours), 0)
  const lowBalanceClients = wallets.filter(w => Number(w.remainingHours) <= 20).length
  const activeWallets = wallets.filter(w => w.status === 'active').length
  return { totalPurchased, totalConsumed, totalRemaining, lowBalanceClients, activeWallets, totalWallets: wallets.length }
}

export async function getLowBalanceWallets(threshold: number) {
  return walletRepo.findLowBalance(threshold)
}

export async function getActiveWalletAlerts() {
  return walletRepo.findActiveAlerts()
}
