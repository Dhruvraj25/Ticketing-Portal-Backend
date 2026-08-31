/**
 * Consolidate Duplicate Client Wallets
 *
 * Merges multiple project-level wallets into a single client-level wallet.
 * Must be run BEFORE the 0011 migration that adds the unique constraint.
 *
 * Strategy:
 *   For each client with multiple wallets:
 *   1. Find the wallet with the most recent activity (or the one with the most hours)
 *   2. Merge all purchased hours, consumed hours, reserved hours
 *   3. Recalculate remaining hours
 *   4. Migrate all wallet transactions to the consolidated wallet
 *   5. Preserve the earliest start date and latest end date
 *   6. Keep the wallet active if any wallet was active
 *   7. Delete the redundant wallets
 *
 * Usage:
 *   npx tsx scripts/consolidate-wallets.ts [--dry-run]
 */

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq, inArray, sql } from 'drizzle-orm'
import { supportWallet, walletTransaction } from '../models/schema'

const isDryRun = process.argv.includes('--dry-run')

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })
  const db = drizzle(pool)

  console.log('🔍 Scanning for clients with duplicate wallets...')
  if (isDryRun) console.log('⚠️  DRY RUN MODE — no changes will be made\n')

  // Step 1: Find clients with multiple wallets
  const clientsWithMultiple = await db
    .select({
      clientId: supportWallet.clientId,
      walletCount: sql<number>`COUNT(*)::int`,
    })
    .from(supportWallet)
    .groupBy(supportWallet.clientId)
    .having(sql`COUNT(*) > 1`)

  if (clientsWithMultiple.length === 0) {
    console.log('✅ All clients already have at most one wallet. Nothing to consolidate.')
    await pool.end()
    return
  }

  console.log(`   Found ${clientsWithMultiple.length} client(s) with multiple wallets\n`)

  let totalConsolidated = 0
  let totalTransactionsMoved = 0
  let totalWalletsRemoved = 0

  for (const { clientId, walletCount } of clientsWithMultiple) {
    console.log(`─── Client: ${clientId} (${walletCount} wallets) ───`)

    // Step 2: Fetch all wallets for this client, ordered by most activity
    const wallets = await db
      .select()
      .from(supportWallet)
      .where(eq(supportWallet.clientId, clientId))
      .orderBy(sql`${supportWallet.consumedHours} DESC, ${supportWallet.totalPurchasedHours} DESC, ${supportWallet.id} ASC`)

    if (wallets.length <= 1) continue

    // Step 3: Choose the "primary" wallet (first in sorted order = most active)
    const primary = wallets[0]
    const toRemove = wallets.slice(1)

    // Step 4: Merge hours
    let totalPurchased = Number(primary.totalPurchasedHours)
    let totalConsumed = Number(primary.consumedHours)
    let totalReserved = Number(primary.reservedHours)

    // Choose the earliest start date and latest end date
    let earliestStart = primary.contractStartDate
    let latestEnd = primary.contractEndDate
    let anyActive = primary.status === 'active'

    for (const w of toRemove) {
      totalPurchased += Number(w.totalPurchasedHours)
      totalConsumed += Number(w.consumedHours)
      totalReserved += Number(w.reservedHours)

      if (w.contractStartDate && (!earliestStart || w.contractStartDate < earliestStart)) {
        earliestStart = w.contractStartDate
      }
      if (w.contractEndDate && (!latestEnd || w.contractEndDate > latestEnd)) {
        latestEnd = w.contractEndDate
      }
      if (w.status === 'active') anyActive = true
    }

    const totalRemaining = totalPurchased - totalConsumed

    console.log(`   Primary wallet: #${primary.id}`)
    console.log(`   Merging ${toRemove.length} wallet(s): ${toRemove.map(w => `#${w.id}`).join(', ')}`)
    console.log(`   Hours: purchased=${totalPurchased}, consumed=${totalConsumed}, remaining=${totalRemaining}`)

    if (!isDryRun) {
      // Step 5: Update the primary wallet
      await db
        .update(supportWallet)
        .set({
          totalPurchasedHours: totalPurchased,
          consumedHours: totalConsumed,
          reservedHours: totalReserved,
          remainingHours: totalRemaining,
          contractStartDate: earliestStart,
          contractEndDate: latestEnd,
          status: anyActive ? 'active' : primary.status,
          projectId: null, // Clear project association — wallet is now client-level
          updatedAt: new Date(),
        })
        .where(eq(supportWallet.id, primary.id))

      // Step 6: Move transactions from secondary wallets to the primary wallet
      const removeWalletIds = toRemove.map(w => w.id)
      const movedTransactions = await db
        .update(walletTransaction)
        .set({ walletId: primary.id })
        .where(inArray(walletTransaction.walletId, removeWalletIds))
        .returning({ id: walletTransaction.id })

      totalTransactionsMoved += movedTransactions.length

      // Step 7: Delete the redundant wallets (transactions already moved)
      await db
        .delete(supportWallet)
        .where(inArray(supportWallet.id, removeWalletIds))

      totalWalletsRemoved += toRemove.length
      console.log(`   ✅ Consolidated: updated wallet #${primary.id}, moved ${movedTransactions.length} transactions, removed ${toRemove.length} wallet(s)`)
    } else {
      // In dry-run mode, just count what would happen
      const txCount = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(walletTransaction)
        .where(inArray(walletTransaction.walletId, toRemove.map(w => w.id)))

      totalTransactionsMoved += txCount[0]?.count || 0
      totalWalletsRemoved += toRemove.length
      console.log(`   [DRY RUN] Would update wallet #${primary.id}, move ${txCount[0]?.count || 0} transactions, remove ${toRemove.length} wallet(s)`)
    }

    totalConsolidated++
    console.log()
  }

  console.log('═══════════════════════════════════════')
  console.log('📊 Consolidation Summary:')
  console.log(`   Clients consolidated: ${totalConsolidated}`)
  console.log(`   Wallets removed: ${totalWalletsRemoved}`)
  console.log(`   Transactions moved: ${totalTransactionsMoved}`)
  if (isDryRun) console.log('\n⚠️  This was a DRY RUN. Run without --dry-run to apply changes.')
  else console.log('\n✅ Consolidation complete. Now run the migration (0011) to add the unique constraint.')

  await pool.end()
}

main().catch((err) => {
  console.error('❌ Consolidation failed:', err)
  process.exit(1)
})
