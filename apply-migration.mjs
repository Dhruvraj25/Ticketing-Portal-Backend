import pg from 'pg'

const DATABASE_URL = 'postgresql://neondb_owner:npg_06TeuIUgVLXM@ep-sweet-river-aqhwknkv-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

const pool = new pg.Pool({ connectionString: DATABASE_URL })

async function applyMigration() {
  const client = await pool.connect()
  try {
    console.log('Connected to database. Applying migration...')

    // Check current state of revision_history table
    const { rows: tableCheck } = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'revision_history'
      ORDER BY ordinal_position
    `)
    
    if (tableCheck.length === 0) {
      console.log('revision_history table does not exist. Creating it...')
    } else {
      console.log('revision_history table exists with columns:')
      tableCheck.forEach(col => console.log(`  ${col.column_name} (${col.data_type}) nullable=${col.is_nullable} default=${col.column_default}`))
    }

    // Apply migration SQL
    await client.query(`ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "revisionCount" integer DEFAULT 0 NOT NULL;`)
    console.log('✓ Added revisionCount column to ticket table')

    await client.query(`
      CREATE TABLE IF NOT EXISTS "revision_history" (
        "id" serial PRIMARY KEY,
        "ticketId" integer NOT NULL REFERENCES "ticket"("id") ON DELETE CASCADE,
        "revisionNumber" integer NOT NULL,
        "requestedById" text NOT NULL,
        "requestedByName" text NOT NULL,
        "requestedByRole" text NOT NULL,
        "revisionNotes" text NOT NULL,
        "priority" text,
        "attachments" text,
        "status" text DEFAULT 'pending' NOT NULL,
        "resolvedAt" timestamp,
        "createdAt" timestamp DEFAULT now() NOT NULL
      );
    `)
    console.log('✓ Created/verified revision_history table')

    // Add any missing columns (in case table exists but is missing columns)
    const missingColumns = [
      `ALTER TABLE "revision_history" ADD COLUMN IF NOT EXISTS "requestedByName" text NOT NULL DEFAULT 'Unknown'`,
      `ALTER TABLE "revision_history" ADD COLUMN IF NOT EXISTS "requestedByRole" text NOT NULL DEFAULT 'unknown'`,
    ]
    for (const sql of missingColumns) {
      await client.query(sql)
    }
    console.log('✓ Ensured all required columns exist')

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_revision_history_ticket_id" ON "revision_history" ("ticketId")`)
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_revision_history_ticket_revision" ON "revision_history" ("ticketId", "revisionNumber")`)
    console.log('✓ Created indexes')

    // Verify final state
    const { rows: finalCheck } = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'revision_history'
      ORDER BY ordinal_position
    `)
    
    console.log('\nFinal revision_history table schema:')
    const requiredCols = ['id', 'ticketId', 'revisionNumber', 'requestedById', 'requestedByName', 'requestedByRole', 'revisionNotes', 'priority', 'attachments', 'status', 'resolvedAt', 'createdAt']
    for (const col of requiredCols) {
      const found = finalCheck.find(c => c.column_name === col)
      if (found) {
        console.log(`  ✓ ${col} (${found.data_type})`)
      } else {
        console.log(`  ✗ MISSING: ${col}`)
      }
    }

    console.log('\nMigration completed successfully!')
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

applyMigration()
