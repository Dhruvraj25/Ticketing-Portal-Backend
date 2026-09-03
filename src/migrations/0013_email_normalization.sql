-- Migration 0013: Case-insensitive email identity
--
-- Emails identify a user regardless of casing (User@Company.com === user@company.com).
-- This migration:
--   1. Resolves any pre-existing case-variant duplicates deterministically:
--      the oldest row keeps the address; later duplicates get a deterministic
--      unique suffix (user+dup-<id>@domain) so no data is lost and no foreign
--      keys break.
--   2. Normalizes all emails to lowercase.
--   3. Adds a unique index on LOWER(email) so the database itself prevents
--      case-variant duplicates from ever being created again.
--
-- Order matters: duplicates must be renamed BEFORE lowercasing, otherwise the
-- existing unique constraint on email would reject the bulk lowercase update.

-- Step 1: rename newer rows of any case-variant duplicate pair.
-- Groups emails by their lowercased form; rows beyond the first (by creation
-- time) are renamed deterministically. Existing exact-duplicate rows (which
-- the unique constraint already prevents) are also covered defensively.
DO $$
DECLARE
  dup RECORD;
  i INT;
BEGIN
  FOR dup IN
    SELECT LOWER("email") AS norm, array_agg("id" ORDER BY "createdAt", "id") AS ids
    FROM "user"
    GROUP BY LOWER("email")
    HAVING COUNT(*) > 1
  LOOP
    FOR i IN 2..array_length(dup.ids, 1) LOOP
      UPDATE "user"
      SET "email" = split_part(dup.norm, '@', 1) || '+dup-' || dup.ids[i] || '@' || split_part(dup.norm, '@', 2)
      WHERE "id" = dup.ids[i];
    END LOOP;
  END LOOP;
END $$;

-- Step 2: normalise existing emails to lowercase (safe now — no duplicates remain).
UPDATE "user" SET "email" = LOWER("email") WHERE "email" <> LOWER("email");

-- Step 3: enforce case-insensitive uniqueness at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_lower_unique_idx" ON "user" (LOWER("email"));