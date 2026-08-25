/**
 * Backfill Support Wallets for Existing Projects
 *
 * Ensures every project in the system has a linked support wallet.
 * Creates one with default values (0 hours, inactive) if none exists.
 *
 * Usage:
 *   npx tsx scripts/backfill-wallets.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import { project, supportWallet } from '../models/schema'

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  const db = drizzle(pool)

  console.log('🔍 Scanning for projects without support wallets...')

  // Get all projects
  const allProjects = await db
    .select({ id: project.id, projectName: project.projectName, clientId: project.clientId })
    .from(project)

  console.log(`   Found ${allProjects.length} total projects`)

  // Get all existing wallets (project IDs that already have wallets)
  const existingWallets = await db
    .select({ projectId: supportWallet.projectId })
    .from(supportWallet)

  const walletProjectIds = new Set(existingWallets.map((w) => w.projectId))

  // Find projects without wallets
  const projectsWithoutWallets = allProjects.filter((p) => !walletProjectIds.has(p.id))

  if (projectsWithoutWallets.length === 0) {
    console.log('✅ All projects already have support wallets. Nothing to backfill.')
    await pool.end()
    return
  }

  console.log(`   ${projectsWithoutWallets.length} projects missing support wallets`)

  // Create wallets for each project without one
  let created = 0
  for (const p of projectsWithoutWallets) {
    await db.insert(supportWallet).values({
      clientId: p.clientId,
      projectId: p.id,
      totalPurchasedHours: 0,
      reservedHours: 0,
      consumedHours: 0,
      remainingHours: 0,
      status: 'inactive',
    })
    created++
    console.log(`   ✅ Created wallet for project #${p.id} — ${p.projectName}`)
  }

  console.log()
  console.log(`🎉 Backfill complete! Created ${created} support wallet(s).`)
  console.log('   These wallets are inactive with 0 hours. Add hours to activate them.')

  await pool.end()
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err)
  process.exit(1)
})
