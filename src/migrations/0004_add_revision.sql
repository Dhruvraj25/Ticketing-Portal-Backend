-- Migration: Add revision tracking to ticket system
-- 1. Add revisionCount to ticket table
ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "revisionCount" integer DEFAULT 0 NOT NULL;

-- 2. Create revision_history table
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

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS "idx_revision_history_ticket_id" ON "revision_history" ("ticketId");
CREATE INDEX IF NOT EXISTS "idx_revision_history_ticket_revision" ON "revision_history" ("ticketId", "revisionNumber");
