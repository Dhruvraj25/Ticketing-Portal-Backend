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

export const getWalletDashboardStats = wrapController('getWalletDashboardStats', async () =>
  walletService.getWalletDashboardStats())

export const getLowBalanceWallets = wrapController('getLowBalanceWallets', async (threshold: number) =>
  walletService.getLowBalanceWallets(threshold))

export const getActiveWalletAlerts = wrapController('getActiveWalletAlerts', async () =>
  walletService.getActiveWalletAlerts())
