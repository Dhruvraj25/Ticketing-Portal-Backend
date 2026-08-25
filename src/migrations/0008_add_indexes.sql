-- Database Index Audit Migration
-- Migration 0008: Add all missing indexes for query performance optimization
-- Verified columns: ticket.projectId, ticket.moduleId, ticket.clientId, ticket.assignedToId,
--   ticket.status, ticket.priority, ticket.createdAt, ticket.updatedAt,
--   wallet.clientId, project.clientId
--
-- All CREATE INDEX statements use IF NOT EXISTS to safely handle
-- indexes that may have been created by previous manual migrations.

-- ============================================================================
-- Ticket Table Indexes
-- ============================================================================

-- Single-column indexes for foreign keys and frequently filtered columns
CREATE INDEX IF NOT EXISTS idx_ticket_status ON ticket ("status");
CREATE INDEX IF NOT EXISTS idx_ticket_priority ON ticket ("priority");
CREATE INDEX IF NOT EXISTS idx_ticket_project_id ON ticket ("projectId");
CREATE INDEX IF NOT EXISTS idx_ticket_module_id ON ticket ("moduleId");
CREATE INDEX IF NOT EXISTS idx_ticket_client_id ON ticket ("clientId");
CREATE INDEX IF NOT EXISTS idx_ticket_assigned_to_id ON ticket ("assignedToId");
CREATE INDEX IF NOT EXISTS idx_ticket_created_at ON ticket ("createdAt");
CREATE INDEX IF NOT EXISTS idx_ticket_updated_at ON ticket ("updatedAt");

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_ticket_project_status ON ticket ("projectId", "status");
CREATE INDEX IF NOT EXISTS idx_ticket_client_status ON ticket ("clientId", "status");
CREATE INDEX IF NOT EXISTS idx_ticket_assignee_status ON ticket ("assignedToId", "status");
CREATE INDEX IF NOT EXISTS idx_ticket_priority_status ON ticket ("priority", "status");
CREATE INDEX IF NOT EXISTS idx_ticket_created_at_status ON ticket ("createdAt", "status");

-- ============================================================================
-- Project Table Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_project_client_id ON project ("clientId");
CREATE INDEX IF NOT EXISTS idx_project_manager_id ON project ("managerId");
CREATE INDEX IF NOT EXISTS idx_project_status ON project ("status");

-- ============================================================================
-- Module Table Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_module_project_id ON module ("projectId");

-- ============================================================================
-- Support Wallet Table Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_support_wallet_client_id ON support_wallet ("clientId");
CREATE INDEX IF NOT EXISTS idx_support_wallet_project_id ON support_wallet ("projectId");
CREATE INDEX IF NOT EXISTS idx_support_wallet_remaining ON support_wallet ("remainingHours");

-- ============================================================================
-- Wallet Transaction Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_wallet_transaction_wallet_id ON wallet_transaction ("walletId");
CREATE INDEX IF NOT EXISTS idx_wallet_transaction_performed_at ON wallet_transaction ("performedAt");

-- ============================================================================
-- Time Log Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_time_log_ticket_id ON time_log ("ticketId");
CREATE INDEX IF NOT EXISTS idx_time_log_user_id ON time_log ("userId");
CREATE INDEX IF NOT EXISTS idx_time_log_start_time ON time_log ("startTime");
CREATE INDEX IF NOT EXISTS idx_time_log_user_start ON time_log ("userId", "startTime");
CREATE INDEX IF NOT EXISTS idx_time_log_end_time ON time_log ("endTime");

-- ============================================================================
-- Comment Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_comment_ticket_id ON comment ("ticketId");

-- ============================================================================
-- Notification Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_notification_user_id ON notification ("userId");
CREATE INDEX IF NOT EXISTS idx_notification_user_unread ON notification ("userId", "isRead");

-- ============================================================================
-- Revision History Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_revision_history_ticket_id ON revision_history ("ticketId");

-- ============================================================================
-- Project-Developer Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_project_developer_user_id ON project_developer ("userId");
CREATE INDEX IF NOT EXISTS idx_project_developer_project_id ON project_developer ("projectId");

-- ============================================================================
-- Ticket History Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tickethistory_ticket_id ON tickethistory ("ticketId");

-- ============================================================================
-- Attachment Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_attachment_ticket_id ON attachment ("ticketId");

-- ============================================================================
-- Benchmark Queries
-- ============================================================================

-- Before/after benchmark queries (run via psql or your SQL client):
--
-- 1. Ticket filtering by status
--    EXPLAIN ANALYZE SELECT * FROM ticket WHERE "status" = 'open';
--
-- 2. Ticket filtering by priority
--    EXPLAIN ANALYZE SELECT * FROM ticket WHERE "priority" = 'high';
--
-- 3. Ticket join on project
--    EXPLAIN ANALYZE SELECT t.*, p."projectName" FROM ticket t
--    JOIN project p ON p.id = t."projectId"
--    WHERE t."projectId" = 1;
--
-- 4. Ticket filtering by client with status
--    EXPLAIN ANALYZE SELECT * FROM ticket
--    WHERE "clientId" = 'some-user-id' AND "status" = 'open';
--
-- 5. Date-range query on updatedAt
--    EXPLAIN ANALYZE SELECT * FROM ticket
--    WHERE "updatedAt" > NOW() - INTERVAL '7 days';
--
-- 6. Wallet lookup by clientId
--    EXPLAIN ANALYZE SELECT * FROM support_wallet WHERE "clientId" = 'some-user-id';
--
-- 7. Ticket assignment queries
--    EXPLAIN ANALYZE SELECT * FROM ticket
--    WHERE "assignedToId" = 'some-user-id' AND "status" = 'in_progress';
