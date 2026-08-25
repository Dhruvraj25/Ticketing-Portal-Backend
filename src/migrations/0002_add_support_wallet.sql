-- Migration: Add Support Wallet Module
-- Tables: support_wallet, wallet_transaction, wallet_alert
-- Ticket fields: isOverrideTicket, overrideReason, overrideBy, overrideDate, estimatedHours, reservedHours, consumedHours

-- Support Wallet table
CREATE TABLE IF NOT EXISTS support_wallet (
  id serial PRIMARY KEY,
  "clientId" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  "projectId" integer NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  "totalPurchasedHours" integer NOT NULL DEFAULT 0,
  "reservedHours" integer NOT NULL DEFAULT 0,
  "consumedHours" integer NOT NULL DEFAULT 0,
  "remainingHours" integer NOT NULL DEFAULT 0,
  "contractStartDate" date,
  "contractEndDate" date,
  status text NOT NULL DEFAULT 'active',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- Wallet Transaction table (immutable audit log)
CREATE TABLE IF NOT EXISTS wallet_transaction (
  id serial PRIMARY KEY,
  "walletId" integer NOT NULL REFERENCES support_wallet(id) ON DELETE CASCADE,
  "transactionType" text NOT NULL,
  hours integer NOT NULL,
  "previousBalance" integer NOT NULL,
  "newBalance" integer NOT NULL,
  reason text,
  remarks text,
  "performedBy" text NOT NULL,
  "performedAt" timestamp NOT NULL DEFAULT now()
);

-- Wallet Alert table
CREATE TABLE IF NOT EXISTS wallet_alert (
  id serial PRIMARY KEY,
  "walletId" integer NOT NULL REFERENCES support_wallet(id) ON DELETE CASCADE,
  "alertType" text NOT NULL,
  message text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "resolvedAt" timestamp
);

-- Add override ticket fields to ticket table (idempotent)
ALTER TABLE ticket
ADD COLUMN IF NOT EXISTS "isOverrideTicket" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "overrideReason" text,
ADD COLUMN IF NOT EXISTS "overrideBy" text,
ADD COLUMN IF NOT EXISTS "overrideDate" timestamp,
ADD COLUMN IF NOT EXISTS "estimatedHours" integer,
ADD COLUMN IF NOT EXISTS "reservedHours" integer,
ADD COLUMN IF NOT EXISTS "consumedHours" integer;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_support_wallet_client ON support_wallet("clientId");
CREATE INDEX IF NOT EXISTS idx_support_wallet_project ON support_wallet("projectId");
CREATE INDEX IF NOT EXISTS idx_wallet_transaction_wallet ON wallet_transaction("walletId");
CREATE INDEX IF NOT EXISTS idx_wallet_alert_wallet ON wallet_alert("walletId");
CREATE INDEX IF NOT EXISTS idx_wallet_alert_unresolved ON wallet_alert("walletId") WHERE "resolvedAt" IS NULL;
