// ============================================================================
// Teams Queue — Asynchronous Message Processing with Retry
// ============================================================================
// Provides an in-memory queue for asynchronous Teams message delivery.
// Follows the same pattern as email.queue.ts for consistency.
//
// Architecture:
//   1. enqueue() adds a message to the in-memory buffer
//   2. processQueue() processes items with retry and backoff
//   3. A periodic poller ensures all items are processed
//   4. Each failed item is retried up to maxRetries with exponential backoff
//
// Production:
//   When webhook URL is set, this queue sends via real HTTP POST.
//   When not, it simulates delivery with mock responses.
// ============================================================================

import {
  TEAMS_QUEUE_PREFIX,
  TEAMS_RETRY,
  TEAMS_QUEUE as QUEUE_CONFIG,
} from './teams.constants'
import type { TeamsQueueEntry, AdaptiveCard, TeamsMention, TeamsMentionTarget, GraphTeamsMember } from './teams.types'
import type { TeamsEventType } from './teams.types'

// ─── Queue State ────────────────────────────────────────────────────────────

let sequence = 0
const queue: TeamsQueueEntry[] = []
let isProcessing = false
let pollTimer: ReturnType<typeof setInterval> | null = null

/**
 * Safety cap on drain waves per processQueue() call. sendWithRetry() owns the
 * retry budget and always removes an entry once it is exhausted, so the queue
 * drains to empty; the cap only prevents a pathological spin.
 */
const MAX_DRAIN_WAVES = 25

// Queue statistics
let totalProcessed = 0
let totalFailed = 0
let totalRetried = 0
let totalProcessingTimeMs = 0

// ─── Public API ─────────────────────────────────────────────────────────────

function generateQueueId(): string {
  sequence++
  return 'teams_' + Date.now().toString(36) + '_' + sequence + '_' + Math.random().toString(36).substring(2, 8)
}

export function enqueue(
  eventType: TeamsEventType,
  payload: Record<string, unknown>,
  card: AdaptiveCard,
  teamId: string,
  channelId: string,
  mention?: TeamsMention | null,
  webhookUrl?: string,
  projectId?: number,
  destinationResolved: boolean = false,
  mentionTarget?: TeamsMentionTarget | null,
  mentionMembers?: GraphTeamsMember[],
): string {
  const id = generateQueueId()

  const entry: TeamsQueueEntry = {
    id,
    eventType,
    payload: payload as any,
    card,
    teamId,
    channelId,
    mention: mention || null,
    // Per-project destination resolved by teams.service. Absent → mock mode.
    // The URL is a secret and is deliberately NOT logged below.
    webhookUrl: webhookUrl || undefined,
    destinationResolved,
    projectId,
    // Resolved ONCE by teams.service, same principle as webhookUrl above —
    // every retry mentions the same people, never re-resolved mid-retry.
    mentionTarget: mentionTarget || null,
    mentionMembers: mentionMembers || [],
    retryCount: 0,
    maxRetries: TEAMS_RETRY.MAX_RETRIES,
    createdAt: new Date(),
  }

  queue.push(entry)

  const route = projectId ? 'project:' + projectId : (webhookUrl ? 'global' : 'mock')
  const mentionInfo = entry.mentionTarget ? (', mentions=' + entry.mentionMembers!.length) : ''
  console.log(TEAMS_QUEUE_PREFIX + ' Queued ' + id + ': ' + eventType + ' -> ' + route + mentionInfo)

  // Fire immediate async processing (non-blocking)
  processQueue().catch(function (err: Error) {
    console.error(TEAMS_QUEUE_PREFIX + ' Background processing error: ' + err.message)
  })

  return id
}

export async function processQueue(): Promise<number> {
  if (isProcessing) return 0
  if (queue.length === 0) return 0

  isProcessing = true
  let processed = 0

  try {
    // Drain in WAVES. A snapshot-only pass leaves entries enqueued during
    // processing stranded until the next poll — with a burst of notifications
    // (or in a process where polling is not running, e.g. scripts/tests) those
    // messages would never be delivered. Each wave processes everything queued
    // so far; entries are removed by sendWithRetry/processQueue as usual, so the
    // loop terminates once the queue is empty.
    let waves = 0
    while (queue.length > 0 && waves < MAX_DRAIN_WAVES) {
      waves++
      const items = [...queue]

      for (const entry of items) {
        const startTime = Date.now()
        try {
          const result = await sendWithRetry(entry)
          totalProcessingTimeMs += Date.now() - startTime

          if (result) {
            removeFromQueue(entry.id)
            totalProcessed++
            processed++
            console.log(TEAMS_QUEUE_PREFIX + ' Delivered ' + entry.id + ': ' + entry.eventType)
          } else if (entry.retryCount >= entry.maxRetries) {
            console.error(TEAMS_QUEUE_PREFIX + ' Permanently failed ' + entry.id + ' after ' + entry.retryCount + ' retries')
            removeFromQueue(entry.id)
            totalFailed++
            processed++
          } else {
            entry.retryCount++
            totalRetried++
            console.warn(TEAMS_QUEUE_PREFIX + ' Will retry ' + entry.id + ' (attempt ' + entry.retryCount + '/' + entry.maxRetries + ')')
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Unknown error')
          console.error(TEAMS_QUEUE_PREFIX + ' Error processing ' + entry.id + ': ' + error.message)
          totalProcessingTimeMs += Date.now() - startTime
          if (entry.retryCount >= entry.maxRetries) {
            removeFromQueue(entry.id)
            totalFailed++
            processed++
          } else {
            entry.retryCount++
            totalRetried++
          }
        }
      }
    }
  } finally {
    isProcessing = false
  }

  return processed
}

export function startQueuePolling(intervalMs: number = 5000): void {
  if (pollTimer) {
    clearInterval(pollTimer)
  }
  pollTimer = setInterval(function () {
    processQueue().catch(function (err: Error) {
      console.error(TEAMS_QUEUE_PREFIX + ' Poll cycle error: ' + err.message)
    })
  }, intervalMs)
  console.log(TEAMS_QUEUE_PREFIX + ' Polling started (interval: ' + intervalMs + 'ms)')
}

export function stopQueuePolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
    console.log(TEAMS_QUEUE_PREFIX + ' Polling stopped')
  }
}

export function getQueueDepth(): number {
  return queue.length
}

export function getQueueEntries(): TeamsQueueEntry[] {
  return [...queue]
}

export function getQueueStats(): {
  totalProcessed: number
  totalFailed: number
  totalRetried: number
  currentDepth: number
  averageProcessingTimeMs: number
} {
  return {
    totalProcessed,
    totalFailed,
    totalRetried,
    currentDepth: queue.length,
    averageProcessingTimeMs: totalProcessed > 0 ? Math.round(totalProcessingTimeMs / totalProcessed) : 0,
  }
}

export function clearQueue(): void {
  queue.length = 0
  console.log(TEAMS_QUEUE_PREFIX + ' Queue cleared')
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function removeFromQueue(id: string): void {
  const index = queue.findIndex(function (e) { return e.id === id })
  if (index !== -1) {
    queue.splice(index, 1)
  }
}

async function sendWithRetry(entry: TeamsQueueEntry): Promise<boolean> {
  // Dynamic import to avoid circular dependency
  const { sendWebhookMessage, sendWebhookMessageMock } = await import('./teams-webhook-client')

  // ── @mention-capable path (Microsoft Graph) — tried FIRST when this
  // project is configured for it. On success this IS the channel post (never
  // also post via webhook — that would duplicate the message). On failure,
  // fall through to the existing webhook path within this SAME attempt, so
  // the notification is still guaranteed to reach the channel even when
  // Graph is unavailable/misconfigured — just without mentions that cycle.
  // This never consumes extra retry budget: one sendWithRetry call is one
  // attempt, whichever transport succeeds.
  if (entry.mentionTarget) {
    const { sendChannelMessageWithMentions } = await import('./teams-graph-client')
    const graphResult = await sendChannelMessageWithMentions({
      teamId: entry.mentionTarget.teamId,
      channelId: entry.mentionTarget.channelId,
      card: entry.card,
      members: entry.mentionMembers || [],
    })
    if (graphResult.success) {
      return true
    }
    console.warn(
      TEAMS_QUEUE_PREFIX + ' Graph mention send failed for ' + entry.id +
      ' (project ' + (entry.projectId ?? '?') + '), falling back to webhook: ' +
      (graphResult.error || 'unknown'),
    )
  }

  // ROOT-CAUSE NOTE (per-project routing): the destination is resolved ONCE by
  // teams.service and carried on the queue entry. A RESOLVED entry is
  // authoritative — the queue must never re-read process.env.TEAMS_WEBHOOK_URL
  // for it, otherwise a project that explicitly has no channel (or a disabled
  // one) would be silently re-routed to the global webhook. Legacy direct
  // callers (destinationResolved === false) keep the historic env fallback.
  const webhookUrl = entry.webhookUrl || (entry.destinationResolved ? undefined : process.env.TEAMS_WEBHOOK_URL)
  const config = {
    webhookUrl,
    enabled: !!webhookUrl,
    mockMode: !webhookUrl,
  }

  let success: boolean

  if (config.enabled) {
    // Use real webhook POST
    const result = await sendWebhookMessage(
      config,
      entry.teamId,
      entry.channelId,
      entry.card as unknown as Record<string, unknown>,
      entry.mention,
    )
    success = result.success

    if (!success) {
      const statusInfo = result.statusCode ? ' (HTTP ' + result.statusCode + ')' : ''
      const errorDetail = result.error ? ' [' + result.error + ']' : ''
      // Never include the webhook URL in the diagnostic.
      entry.lastError = (result.error || 'Unknown webhook error') + statusInfo
      console.warn(
        TEAMS_QUEUE_PREFIX + ' Delivery failed for ' + entry.id +
        ' (project ' + (entry.projectId ?? 'global') + ')' + statusInfo + errorDetail + ': ' +
        (result.error || 'Unknown error'),
      )
    }
  } else {
    // No destination configured for this project and no global fallback —
    // simulate delivery (mock mode), exactly as before per-project channels.
    const result = await sendWebhookMessageMock(
      config,
      entry.teamId,
      entry.channelId,
      entry.card as unknown as Record<string, unknown>,
      entry.mention,
    )
    success = result
    if (!success) entry.lastError = 'Mock delivery failed'
  }

  if (!success) {
    // ROOT-CAUSE FIX: sendWithRetry owns the retry budget. The previous
    // version recursed while `entry.retryCount < entry.maxRetries` but never
    // incremented retryCount inside the recursion, so a webhook that kept
    // returning an error (sendWebhookMessage resolves with {success:false} —
    // it never throws) retried forever with growing backoff. isProcessing
    // stayed true, processQueue() returned 0 for every later call, and the
    // queue was PERMANENTLY STUCK: all subsequent Teams notifications were
    // enqueued but never delivered. Count the attempt here and terminate.
    entry.retryCount++
    if (entry.retryCount >= entry.maxRetries) {
      // The outer processQueue loop logs the permanent failure and removes
      // the entry from the queue — return false to hand control back.
      return false
    }
    const delay = TEAMS_RETRY.INITIAL_DELAY_MS * Math.pow(TEAMS_RETRY.BACKOFF_MULTIPLIER, entry.retryCount - 1)
    console.log(
      TEAMS_QUEUE_PREFIX + ' Retrying ' + entry.id + ' in ' + delay + 'ms (attempt ' + (entry.retryCount + 1) + '/' + entry.maxRetries + ')...',
    )
    await sleep(delay)
    return sendWithRetry(entry)
  }

  return success
}

function sleep(ms: number): Promise<void> {
  return new Promise(function (resolve) { setTimeout(resolve, ms) })
}

// ─── Barrel Export ──────────────────────────────────────────────────────────

export const teamsQueue = {
  enqueue,
  processQueue,
  startQueuePolling,
  stopQueuePolling,
  getQueueDepth,
  getQueueEntries,
  getQueueStats,
  clearQueue,
}
