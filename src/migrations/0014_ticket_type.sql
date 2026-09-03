-- Migration 0014: ticket type column
--
-- Adds a "type" dropdown value to tickets (Create Ticket → Save Draft).
-- Free-text column like status/priority/category — no enum constraint needed.
-- Existing tickets default to 'general'.

ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'general';