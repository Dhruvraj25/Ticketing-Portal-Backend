-- Performance Indexes for SupportHub
-- Migration 0006: Add comprehensive indexes for dashboard queries, filtering, and joins

-- ============================================================================
-- Ticket Indexes
-- ============================================================================

-- Status-based filtering (dashboard stats, review queue)
CREATE INDEX IF NOT EXISTS idx_ticket_status ON ticket ("status");

-- Project-based filtering (project detail page)
CREATE INDEX IF NOT EXISTS idx_ticket_project_id ON ticket ("projectId");

-- Client-based filtering (client dashboard)
CREATE INDEX IF NOT EXISTS idx_ticket_client_id ON ticket ("clientId");

-- Developer assignment queries
CREATE INDEX IF NOT EXISTS idx_ticket_assigned_to_id ON ticket ("assignedToId");

-- Date-range queries (recent tickets, analytics)
CREATE INDEX IF NOT EXISTS idx_ticket_created_at ON ticket ("createdAt");

-- Composite index for dashboard status aggregations by role
CREATE INDEX IF NOT EXISTS idx_ticket_client_status ON ticket ("clientId", "status");
CREATE INDEX IF NOT EXISTS idx_ticket_assignee_status ON ticket ("assignedToId", "status");

-- Composite index for project + status filtering
CREATE INDEX IF NOT EXISTS idx_ticket_project_status ON ticket ("projectId", "status");

-- Composite index for date-based aggregations
CREATE INDEX IF NOT EXISTS idx_ticket_created_at_status ON ticket ("createdAt", "status");

-- ============================================================================
-- Project Indexes
-- ============================================================================

-- Client-based project filtering
CREATE INDEX IF NOT EXISTS idx_project_client_id ON project ("clientId");

-- Manager-based project filtering
CREATE INDEX IF NOT EXISTS idx_project_manager_id ON project ("managerId");

-- Status-based filtering
CREATE INDEX IF NOT EXISTS idx_project_status ON project ("status");

-- ============================================================================
-- Worklog / TimeLog Indexes
-- ============================================================================

-- Ticket-based time log queries
CREATE INDEX IF NOT EXISTS idx_time_log_ticket_id ON time_log ("ticketId");

-- User-based time log queries (developer dashboard, productivity)
CREATE INDEX IF NOT EXISTS idx_time_log_user_id ON time_log ("userId");

-- Start time range queries (productivity reports)
CREATE INDEX IF NOT EXISTS idx_time_log_start_time ON time_log ("startTime");

-- Composite index for productivity queries (user + time range)
CREATE INDEX IF NOT EXISTS idx_time_log_user_start ON time_log ("userId", "startTime");

-- Filter for completed logs (end_time IS NOT NULL)
CREATE INDEX IF NOT EXISTS idx_time_log_end_time ON time_log ("endTime");

-- ============================================================================
-- Support Wallet Indexes
-- ============================================================================

-- Project-based wallet lookup
CREATE INDEX IF NOT EXISTS idx_support_wallet_project_id ON support_wallet ("projectId");

-- Client-based wallet filtering
CREATE INDEX IF NOT EXISTS idx_support_wallet_client_id ON support_wallet ("clientId");

-- Remaining hours filtering (low balance detection)
CREATE INDEX IF NOT EXISTS idx_support_wallet_remaining ON support_wallet ("remainingHours");

-- ============================================================================
-- Wallet Transaction Indexes
-- ============================================================================

-- Wallet-based transaction history
CREATE INDEX IF NOT EXISTS idx_wallet_transaction_wallet_id ON wallet_transaction ("walletId");

-- Date-ordered transactions
CREATE INDEX IF NOT EXISTS idx_wallet_transaction_performed_at ON wallet_transaction ("performedAt");

-- ============================================================================
-- Comment Indexes
-- ============================================================================

-- Ticket-based comment queries
CREATE INDEX IF NOT EXISTS idx_comment_ticket_id ON comment ("ticketId");

-- ============================================================================
-- Notification Indexes
-- ============================================================================

-- User-based notification queries
CREATE INDEX IF NOT EXISTS idx_notification_user_id ON notification ("userId");

-- Unread notification filtering
CREATE INDEX IF NOT EXISTS idx_notification_user_unread ON notification ("userId", "isRead");

-- ============================================================================
-- Revision History Indexes
-- ============================================================================

-- Ticket-based revision queries
CREATE INDEX IF NOT EXISTS idx_revision_history_ticket_id ON revision_history ("ticketId");

-- ============================================================================
-- Project-Developer Indexes
-- ============================================================================

-- User-based developer assignment lookup
CREATE INDEX IF NOT EXISTS idx_project_developer_user_id ON project_developer ("userId");

-- Project-based developer lookup
CREATE INDEX IF NOT EXISTS idx_project_developer_project_id ON project_developer ("projectId");

-- ============================================================================
-- Module Indexes
-- ============================================================================

-- Project-based module queries
CREATE INDEX IF NOT EXISTS idx_module_project_id ON module ("projectId");
