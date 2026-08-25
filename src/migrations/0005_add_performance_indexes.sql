-- Performance Optimization: Add database indexes for all foreign keys and frequently filtered columns
-- Estimated improvement: 10x-100x faster queries

-- Tickets table indexes
CREATE INDEX IF NOT EXISTS idx_ticket_status ON ticket ("status");
CREATE INDEX IF NOT EXISTS idx_ticket_project_id ON ticket ("projectId");
CREATE INDEX IF NOT EXISTS idx_ticket_client_id ON ticket ("clientId");
CREATE INDEX IF NOT EXISTS idx_ticket_assigned_to_id ON ticket ("assignedToId");
CREATE INDEX IF NOT EXISTS idx_ticket_module_id ON ticket ("moduleId");
CREATE INDEX IF NOT EXISTS idx_ticket_created_at ON ticket ("createdAt");
CREATE INDEX IF NOT EXISTS idx_ticket_project_status ON ticket ("projectId", "status");
CREATE INDEX IF NOT EXISTS idx_ticket_assigned_status ON ticket ("assignedToId", "status");

-- Time logs indexes
CREATE INDEX IF NOT EXISTS idx_time_log_ticket_id ON time_log ("ticketId");
CREATE INDEX IF NOT EXISTS idx_time_log_user_id ON time_log ("userId");
CREATE INDEX IF NOT EXISTS idx_time_log_start_time ON time_log ("startTime");
CREATE INDEX IF NOT EXISTS idx_time_log_user_start ON time_log ("userId", "startTime");

-- Project indexes
CREATE INDEX IF NOT EXISTS idx_project_client_id ON project ("clientId");
CREATE INDEX IF NOT EXISTS idx_project_manager_id ON project ("managerId");
CREATE INDEX IF NOT EXISTS idx_project_status ON project ("status");

-- Module indexes
CREATE INDEX IF NOT EXISTS idx_module_project_id ON module ("projectId");

-- Support wallet indexes
CREATE INDEX IF NOT EXISTS idx_wallet_client_id ON support_wallet ("clientId");
CREATE INDEX IF NOT EXISTS idx_wallet_project_id ON support_wallet ("projectId");
CREATE INDEX IF NOT EXISTS idx_wallet_client_project ON support_wallet ("clientId", "projectId");
CREATE INDEX IF NOT EXISTS idx_wallet_remaining ON support_wallet ("remainingHours");

-- Wallet transaction indexes
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_id ON wallet_transaction ("walletId");
CREATE INDEX IF NOT EXISTS idx_wallet_tx_performed_at ON wallet_transaction ("performedAt");
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_date ON wallet_transaction ("walletId", "performedAt");
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type ON wallet_transaction ("transactionType");

-- Wallet alert indexes
CREATE INDEX IF NOT EXISTS idx_wallet_alert_wallet_id ON wallet_alert ("walletId");
CREATE INDEX IF NOT EXISTS idx_wallet_alert_unresolved ON wallet_alert ("walletId") WHERE "resolvedAt" IS NULL;

-- Comment indexes
CREATE INDEX IF NOT EXISTS idx_comment_ticket_id ON comment ("ticketId");

-- Ticket history indexes// temp change ()//
CREATE INDEX IF NOT EXISTS idx_tickethistory_ticket_id ON tickethistory ("ticketId");

-- Attachment indexes
CREATE INDEX IF NOT EXISTS idx_attachment_ticket_id ON attachment ("ticketId");

-- Notification indexes
CREATE INDEX IF NOT EXISTS idx_notification_user_id ON notification ("userId");
CREATE INDEX IF NOT EXISTS idx_notification_user_unread ON notification ("userId") WHERE "isRead" = false;

-- Revision history indexes
CREATE INDEX IF NOT EXISTS idx_revision_ticket_id ON revision_history ("ticketId");

-- User indexes
CREATE INDEX IF NOT EXISTS idx_user_role ON "user" ("role");
CREATE INDEX IF NOT EXISTS idx_user_email ON "user" ("email");
