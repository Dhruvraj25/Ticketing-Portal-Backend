import * as walletService from '../services/wallet.service'
import { wrapController } from '../lib/performance-profiler'
import type { AuthenticatedUser } from '../services/user.service'

export const getWallets = wrapController('getWallets', async (currentUser: AuthenticatedUser) =>
  walletService.getWallets(currentUser))

export const getWalletById = wrapController('getWalletById', async (walletId: number, currentUser: AuthenticatedUser) =>
  walletService.getWalletById(walletId, currentUser))

export const getWalletTransactions = wrapController('getWalletTransactions', async (walletId: number, currentUser: AuthenticatedUser) =>
  walletService.getWalletTransactions(walletId, currentUser))

export const getWalletTicketConsumption = wrapController('getWalletTicketConsumption', async (walletId: number, currentUser: AuthenticatedUser) =>
  walletService.getWalletTicketConsumption(walletId, currentUser))

export const addWalletHours = wrapController('addWalletHours', async (data: any, currentUser: AuthenticatedUser) =>
  walletService.addWalletHours(data, currentUser))

export const getWalletDashboardStats = wrapController('getWalletDashboardStats', async (currentUser: AuthenticatedUser) =>
  walletService.getWalletDashboardStats(currentUser))

export const getLowBalanceWallets = wrapController('getLowBalanceWallets', async (threshold: number, currentUser: AuthenticatedUser) =>
  walletService.getLowBalanceWallets(threshold, currentUser))

export const getActiveWalletAlerts = wrapController('getActiveWalletAlerts', async (currentUser: AuthenticatedUser) =>
  walletService.getActiveWalletAlerts(currentUser))
