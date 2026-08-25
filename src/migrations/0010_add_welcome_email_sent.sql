-- Migration 0010: Add welcome_email_sent column to user table
-- Tracks whether a user has received their welcome email on first login.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "welcome_email_sent" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "idx_user_welcome_email_sent" ON "user" ("welcome_email_sent") WHERE "welcome_email_sent" = false;
