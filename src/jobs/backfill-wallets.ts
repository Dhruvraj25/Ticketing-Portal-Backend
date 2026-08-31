/**
 * Backfill Support Wallets — Client-Level Architecture
 *
 * Ensures every client in the system has exactly ONE support wallet.
 * In the new architecture, wallets belong to clients, not projects.
 *
 * Usage:
 *   npx tsx src/jobs/backfill-wallets.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq, sql } from 'drizzle-orm'
import { user, supportWallet, project } from '../models/schema'

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  const db = drizzle(pool)

  console.log('🔍 Scanning for clients without support wallets...')

  // Step 1: Get all clients
  const allClients = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.role, 'client'))

  console.log(`   Found ${allClients.length} total clients`)

  // Step 2: Get all clients that already have wallets
  const clientsWithWallets = await db
    .select({ clientId: supportWallet.clientId })
    .from(supportWallet)
    .groupBy(supportWallet.clientId)

  const clientWalletIds = new Set(clientsWithWallets.map((w) => w.clientId))

  // Step 3: Find clients without wallets
  const clientsWithoutWallets = allClients.filter((c) => !clientWalletIds.has(c.id))

  if (clientsWithoutWallets.length === 0) {
    console.log('✅ All clients already have support wallets. Nothing to backfill.')
    await pool.end()
    return
  }

  console.log(`   ${clientsWithoutWallets.length} clients missing support wallets`)

  // Step 4: Create ONE wallet per client (no project association)
  let created = 0
  for (const c of clientsWithoutWallets) {
    await db.insert(supportWallet).values({
      clientId: c.id,
      projectId: null, // Client-level wallet — no project association
      totalPurchasedHours: 0,
      reservedHours: 0,
      consumedHours: 0,
      remainingHours: 0,
      status: 'inactive',
    })
    created++
    console.log(`   ✅ Created wallet for client ${c.name} (${c.id})`)
  }

  console.log()
  console.log(`🎉 Backfill complete! Created ${created} client wallet(s).`)
  console.log('   These wallets are inactive with 0 hours. Add hours to activate them.')

  // Step 5: Verify — no client should have more than 1 wallet
  const duplicates = await db
    .select({
      clientId: supportWallet.clientId,
      walletCount: sql<number>`COUNT(*)::int`,
    })
    .from(supportWallet)
    .groupBy(supportWallet.clientId)
    .having(sql`COUNT(*) > 1`)

  if (duplicates.length > 0) {
    console.log()
    console.log('⚠️  WARNING: Some clients still have multiple wallets!')
    console.log('   Run the consolidation script first: npx tsx scripts/consolidate-wallets.ts')
    for (const d of duplicates) {
      console.log(`   Client ${d.clientId}: ${d.walletCount} wallets`)
    }
  }

  await pool.end()
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err)
  process.exit(1)
})
