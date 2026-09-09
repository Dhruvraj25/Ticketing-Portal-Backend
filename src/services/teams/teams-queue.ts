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
import type { TeamsQueueEntry, AdaptiveCard, TeamsMention } from './teams.types'
import type { TeamsEventType } from './teams.types'

// ─── Queue State ────────────────────────────────────────────────────────────

let sequence = 0
const queue: TeamsQueueEntry[] = []
let isProcessing = false
let pollTimer: ReturnType<typeof setInterval> | null = null

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
    retryCount: 0,
    maxRetries: TEAMS_RETRY.MAX_RETRIES,
    createdAt: new Date(),
  }

  queue.push(entry)

  console.log(TEAMS_QUEUE_PREFIX + ' Queued ' + id + ': ' + eventType + ' -> ' + channelId)

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
  const { sendWebhookMessage, sendWebhookMessageMock, loadTeamsConfig } = await import('./teams-webhook-client')
  const config = loadTeamsConfig()

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
      console.warn(
        TEAMS_QUEUE_PREFIX + ' Delivery failed for ' + entry.id + statusInfo + errorDetail + ': ' +
        (result.error || 'Unknown error'),
      )
    }
  } else {
    // Use mock sender for development
    const result = await sendWebhookMessageMock(
      config,
      entry.teamId,
      entry.channelId,
      entry.card as unknown as Record<string, unknown>,
      entry.mention,
    )
    success = result
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
