// ============================================================================
// Email Queue — Asynchronous Email Processing
// ============================================================================
//
// Provides an in-memory queue for asynchronous email processing.
// Email sending never blocks API responses — it is always dispatched
// asynchronously through this queue.
//
// Architecture:
//   1. send() calls enqueue() which adds the email to an in-memory buffer
//   2. processQueue() is called immediately (fire-and-forget) to process
//   3. A periodic poller can also process remaining items
//   4. Each failed item is retried up to maxRetries with exponential backoff
//
// Future enhancement: Replace in-memory queue with Bull/BullMQ or similar
// by implementing the same enqueue/process interface but using Redis.
// ============================================================================

import type { SendEmailParams, SendEmailResult, EmailQueueEntry, EmailEventType } from './email.types'
import { getProvider } from './email.provider'
import { EMAIL_QUEUE_PREFIX, EMAIL_LOG_PREFIX, EMAIL_RETRY } from './email.constants'

// ─── State ──────────────────────────────────────────────────────────────────

let sequence = 0
const queue: EmailQueueEntry[] = []
let isProcessing = false
let pollTimer: ReturnType<typeof setInterval> | null = null

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a unique email ID.
 */
function generateEmailId(): string {
  sequence++
  return `email_${Date.now().toString(36)}_${sequence}_${Math.random().toString(36).substring(2, 8)}`
}

/**
 * Enqueue an email for asynchronous delivery.
 * This is extremely fast — it only pushes to an in-memory array.
 * Never throws — errors are caught and logged.
 */
export function enqueue(params: SendEmailParams, eventType?: EmailEventType): string {
  const id = generateEmailId()

  // Resolve the event type (params.eventType is set by email.service senders)
  // and embed it into the params so the provider can log the template name
  // and apply event-aware redaction.
  const resolvedEventType = (params.eventType || eventType || 'general') as EmailEventType
  const paramsWithEvent = { ...params, eventType: resolvedEventType }

  const entry: EmailQueueEntry = {
    id,
    params: paramsWithEvent,
    eventType: resolvedEventType,
    retryCount: 0,
    maxRetries: EMAIL_RETRY.MAX_RETRIES,
    createdAt: new Date(),
  }

  queue.push(entry)

  console.log(`${EMAIL_QUEUE_PREFIX} Queued ${id}: ${params.subject} → ${Array.isArray(params.to) ? params.to.join(', ') : params.to}`)

  // Fire immediate async processing (non-blocking)
  processQueue().catch((err: Error) => {
    console.error(`${EMAIL_QUEUE_PREFIX} Background processing error:`, err.message)
  })

  return id
}

/**
 * Process all items currently in the queue.
 * Each item is sent via the configured provider.
 * Failed items are either retried or marked as permanently failed.
 *
 * @returns Number of items processed
 */
export async function processQueue(): Promise<number> {
  if (isProcessing) return 0
  if (queue.length === 0) return 0

  isProcessing = true
  let processed = 0

  try {
    const provider = getProvider()
    const items = [...queue]

    for (const entry of items) {
      try {
        const result = await sendWithRetry(provider.send(entry.params), entry)

        if (result.success) {
          removeFromQueue(entry.id)
          processed++
        } else if (entry.retryCount >= entry.maxRetries) {
          console.error(`${EMAIL_QUEUE_PREFIX} Permanently failed ${entry.id} after ${entry.retryCount} retries: ${entry.params.subject}`)
          removeFromQueue(entry.id)
          processed++
        } else {
          entry.retryCount++
          console.warn(`${EMAIL_QUEUE_PREFIX} Will retry ${entry.id} (attempt ${entry.retryCount}/${entry.maxRetries})`)
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error')
        console.error(`${EMAIL_QUEUE_PREFIX} Error processing ${entry.id}:`, error.message)

        if (entry.retryCount >= entry.maxRetries) {
          removeFromQueue(entry.id)
          processed++
        } else {
          entry.retryCount++
        }
      }
    }
  } finally {
    isProcessing = false
  }

  return processed
}

/**
 * Send an email immediately, bypassing the queue.
 * Useful for urgent emails or testing.
 * Returns the send result directly.
 */
export async function sendImmediately(params: SendEmailParams): Promise<SendEmailResult> {
  const provider = getProvider()
  try {
    console.log(`${EMAIL_LOG_PREFIX} Sending immediate: ${params.subject} → ${Array.isArray(params.to) ? params.to.join(', ') : params.to}`)
    const result = await provider.send(params)
    if (result.success) {
      console.log(`${EMAIL_LOG_PREFIX} Immediate send success: ${result.messageId}`)
    } else {
      console.error(`${EMAIL_LOG_PREFIX} Immediate send failed:`, result.error)
    }
    return result
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error')
    console.error(`${EMAIL_LOG_PREFIX} Immediate send error:`, error.message)
    return { success: false, error: 'Failed to send email' }
  }
}

/**
 * Get the current queue depth.
 */
export function getQueueDepth(): number {
  return queue.length
}

/**
 * Start periodic queue processing.
 * @param intervalMs Polling interval in milliseconds. Defaults to EMAIL_QUEUE.POLL_INTERVAL_MS
 * @returns The timer ID (call clearInterval to stop)
 */
export function startQueuePolling(intervalMs: number = 5_000): ReturnType<typeof setInterval> {
  if (pollTimer) {
    clearInterval(pollTimer)
  }

  pollTimer = setInterval(() => {
    processQueue().catch((err: Error) => {
      console.error(`${EMAIL_QUEUE_PREFIX} Poll cycle error:`, err.message)
    })
  }, intervalMs)

  console.log(`${EMAIL_QUEUE_PREFIX} Polling started (interval: ${intervalMs}ms)`)
  return pollTimer
}

/**
 * Stop periodic queue processing.
 */
export function stopQueuePolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
    console.log(`${EMAIL_QUEUE_PREFIX} Polling stopped`)
  }
}

/**
 * Get all current queue entries (for monitoring/debugging).
 */
export function getQueue(): EmailQueueEntry[] {
  return [...queue]
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function removeFromQueue(id: string): void {
  const index = queue.findIndex(e => e.id === id)
  if (index !== -1) {
    queue.splice(index, 1)
  }
}

async function sendWithRetry(
  sendPromise: Promise<SendEmailResult>,
  entry: EmailQueueEntry,
): Promise<SendEmailResult> {
  const result = await sendPromise

  if (!result.success && entry.retryCount < entry.maxRetries) {
    const delay = EMAIL_RETRY.INITIAL_DELAY_MS * Math.pow(EMAIL_RETRY.BACKOFF_MULTIPLIER, entry.retryCount)
    console.log(`${EMAIL_QUEUE_PREFIX} Retrying ${entry.id} in ${delay}ms...`)
    await sleep(delay)
    return sendWithRetry(getProvider().send(entry.params), entry)
  }

  return result
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
