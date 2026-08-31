-- Migration 0011: One Wallet Per Client Architecture
-- Adds unique constraint on clientId to ensure exactly one wallet per client.
-- projectId is kept as nullable for backward compatibility but wallet ownership
-- is determined ONLY by clientId.
--
-- IMPORTANT: Run the consolidation script (scripts/consolidate-wallets.ts) BEFORE
-- applying this migration to merge duplicate client wallets into one.

-- Step 1: Consolidate duplicate wallets (handled by scripts/consolidate-wallets.ts)
-- The script runs first to merge all wallets per client into one, then we add the constraint.

-- Step 2: Add unique constraint ensuring one wallet per client
-- We only enforce this for active wallets to avoid issues with historical data.
-- Use a partial unique index for active wallets.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_client_active_unique_idx
  ON support_wallet ("clientId")
  WHERE status != 'archived';

-- Step 3: Add a composite index for efficient client wallet lookups
CREATE INDEX IF NOT EXISTS wallet_client_id_active_idx
  ON support_wallet ("clientId")
  WHERE status IN ('active', 'inactive');

-- Step 4: Deprecation comment on projectId (informational only)
COMMENT ON COLUMN support_wallet."projectId" IS 'DEPRECATED: Wallets are now client-level. This field is kept for backward compatibility and transaction metadata only. Do NOT use for wallet ownership lookups.';

-- Step 5: Add a helpful comment on the table
COMMENT ON TABLE support_wallet IS 'One wallet per client. Wallet ownership is determined by clientId only. Multiple projects/modules share the same client wallet.';
