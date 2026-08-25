// ============================================================================
// Teams Monitor — Logging, Metrics & Health Tracking
// ============================================================================
// Provides centralized monitoring for the Teams notification system.
// Tracks all events, errors, and performance metrics in memory.
// ============================================================================

import {
  TEAMS_MONITOR_PREFIX,
  TEAMS_MONITOR as MONITOR_CONFIG,
} from './teams.constants'
import type { TeamsMonitorEvent, TeamsHealthStatus } from './teams.types'
import type { TeamsEventType } from './teams.types'

// ─── State ──────────────────────────────────────────────────────────────────

let eventLog: TeamsMonitorEvent[] = []
let messageLog: string[] = []
let messagesSent = 0
let messagesFailed = 0
let lastTestTimestamp: string | null = null
let lastTestResult: 'success' | 'failure' | null = null

// ─── Public API ─────────────────────────────────────────────────────────────

export function recordEvent(event: Omit<TeamsMonitorEvent, 'id' | 'timestamp'>): void {
  const entry: TeamsMonitorEvent = {
    id: 'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
    timestamp: Date.now(),
    ...event,
  }

  eventLog.push(entry)

  // Trim log if too large
  if (eventLog.length > MONITOR_CONFIG.MAX_EVENTS) {
    eventLog = eventLog.slice(-MONITOR_CONFIG.MAX_EVENTS)
  }
}

export function recordMessageSend(success: boolean, eventType?: TeamsEventType, durationMs?: number): void {
  if (success) {
    messagesSent++
  } else {
    messagesFailed++
  }

  recordEvent({
    type: success ? 'send' : 'error',
    eventType,
    message: success ? 'Message sent successfully' : 'Message send failed',
    durationMs,
    metadata: { success },
  })
}

export function recordError(error: string, eventType?: TeamsEventType, metadata?: Record<string, unknown>): void {
  messagesFailed++
  recordEvent({
    type: 'error',
    eventType,
    message: error,
    metadata,
  })
  console.error(TEAMS_MONITOR_PREFIX + ' ' + error)
}

export function recordRetry(eventType: TeamsEventType, attempt: number, error: string): void {
  recordEvent({
    type: 'retry',
    eventType,
    message: 'Retry #' + attempt + ' for ' + eventType + ': ' + error,
    metadata: { attempt },
  })
}

export function recordTokenEvent(message: string, durationMs?: number): void {
  recordEvent({
    type: 'token',
    message,
    durationMs,
  })
}

export function recordQueueEvent(message: string, queueDepth?: number): void {
  recordEvent({
    type: 'queue',
    message: message + (queueDepth !== undefined ? ' (depth: ' + queueDepth + ')' : ''),
    metadata: queueDepth !== undefined ? { queueDepth } : undefined,
  })
}

export function recordTestResult(success: boolean, message: string, durationMs?: number): void {
  lastTestTimestamp = new Date().toISOString()
  lastTestResult = success ? 'success' : 'failure'

  recordEvent({
    type: 'test',
    message: (success ? 'Test passed: ' : 'Test failed: ') + message,
    durationMs,
    metadata: { success },
  })
}

export function log(message: string): void {
  messageLog.push('[' + new Date().toISOString() + '] ' + message)
  if (messageLog.length > MONITOR_CONFIG.MAX_LOG_LINES) {
    messageLog = messageLog.slice(-MONITOR_CONFIG.MAX_LOG_LINES)
  }
}

export function getHealthStatus(config: { enabled: boolean; webhookUrl?: string }, queueDepth: number): TeamsHealthStatus {
  const configured = config.enabled
  const ready = configured && !!config.webhookUrl

  let statusMessage: string
  if (ready) {
    statusMessage = 'Teams webhook is configured and ready'
  } else if (configured) {
    statusMessage = 'Webhook URL present but may be invalid'
  } else {
    statusMessage = 'Teams integration disabled — set TEAMS_WEBHOOK_URL to enable'
  }

  return {
    provider: 'microsoft-teams-webhook',
    configured,
    mockMode: !configured,
    ready,
    status: ready ? 'ready' : configured ? 'partial' : 'disabled',
    webhookConfigured: !!config.webhookUrl,
    queueDepth,
    messagesSent,
    messagesFailed,
    lastTestAt: lastTestTimestamp,
    lastTestResult,
    message: statusMessage,
  }
}

export function getEventLog(): TeamsMonitorEvent[] {
  return [...eventLog]
}

export function getRecentEvents(count: number = 20): TeamsMonitorEvent[] {
  return eventLog.slice(-count).reverse()
}

export function getMessageLog(): string[] {
  return [...messageLog]
}

export function getStats(): {
  messagesSent: number
  messagesFailed: number
  totalEvents: number
  logLines: number
} {
  return {
    messagesSent,
    messagesFailed,
    totalEvents: eventLog.length,
    logLines: messageLog.length,
  }
}

export function resetStats(): void {
  eventLog = []
  messageLog = []
  messagesSent = 0
  messagesFailed = 0
  lastTestTimestamp = null
  lastTestResult = null
}

// ─── Barrel Export ──────────────────────────────────────────────────────────

export const teamsMonitor = {
  recordEvent,
  recordMessageSend,
  recordError,
  recordRetry,
  recordTokenEvent,
  recordQueueEvent,
  recordTestResult,
  log,
  getHealthStatus,
  getEventLog,
  getRecentEvents,
  getMessageLog,
  getStats,
  resetStats,
}
