/**
 * Backfill Support Wallets — Company-Level Architecture
 *
 * Ensures every company that has client users owns exactly ONE support
 * wallet (support_wallet.companyId). A company without one gets an empty,
 * inactive wallet (0 hours) whose primary contact is its Approver (else its
 * earliest client user). Never creates per-user or per-project wallets.
 *
 * Client users without a company must be linked first with
 * Frontend/scripts/migrate-company-wallets.ts.
 *
 * Usage:
 *   npx tsx src/jobs/backfill-wallets.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { user, company, supportWallet } from '../models/schema'

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  const db = drizzle(pool)

  console.log('🔍 Scanning for companies without a support wallet...')

  const unlinked = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, 'client'), isNull(user.companyId)))
  if (unlinked.length > 0) {
    console.log(`⚠️  ${unlinked.length} client user(s) have no company. Run Frontend/scripts/migrate-company-wallets.ts first.`)
  }

  const companies = await db
    .select({ id: company.id, name: company.name })
    .from(company)
    .leftJoin(supportWallet, eq(supportWallet.companyId, company.id))
    .where(isNull(supportWallet.id))

  let created = 0
  for (const c of companies) {
    const members = await db
      .select({ id: user.id, clientType: user.clientType })
      .from(user)
      .where(and(eq(user.companyId, c.id), eq(user.role, 'client')))
      .orderBy(asc(user.createdAt), asc(user.id))
    if (members.length === 0) continue
    const contact = members.find((m) => m.clientType === 'approver') ?? members[0]
    const rows = await db
      .insert(supportWallet)
      .values({
        clientId: contact.id,
        companyId: c.id,
        projectId: null, // Company-level wallet — no project association
        totalPurchasedHours: 0,
        reservedHours: 0,
        consumedHours: 0,
        remainingHours: 0,
        status: 'inactive',
      })
      .onConflictDoNothing()
      .returning({ id: supportWallet.id })
    if (rows.length) {
      created++
      console.log(`   ✅ Created company wallet #${rows[0].id} for ${c.name}`)
    }
  }

  console.log()
  console.log(created
    ? `🎉 Backfill complete! Created ${created} company wallet(s). They are inactive with 0 hours — add hours to activate them.`
    : '✅ Every company already has its support wallet. Nothing to backfill.')

  // Verify — no company may have more than 1 wallet (also a unique index).
  const duplicates = await db
    .select({
      companyId: supportWallet.companyId,
      walletCount: sql<number>`COUNT(*)::int`,
    })
    .from(supportWallet)
    .where(sql`${supportWallet.companyId} IS NOT NULL`)
    .groupBy(supportWallet.companyId)
    .having(sql`COUNT(*) > 1`)

  if (duplicates.length > 0) {
    console.log()
    console.log('⚠️  WARNING: Some companies have multiple wallets!')
    for (const d of duplicates) {
      console.log(`   Company ${d.companyId}: ${d.walletCount} wallets`)
    }
  }

  await pool.end()
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err)
  process.exit(1)
})
