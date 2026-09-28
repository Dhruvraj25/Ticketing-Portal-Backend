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
import { EMAIL_QUEUE_PREFIX, EMAIL_LOG_PREFIX, EMAIL_RETRY, getGraphErrorMessage } from './email.constants'

// ─── State ──────────────────────────────────────────────────────────────────

let sequence = 0
const queue: EmailQueueEntry[] = []
let isProcessing = false
let pollTimer: ReturnType<typeof setInterval> | null = null

// ─── Email log (Admin → Email Management) ───────────────────────────────────
// Every queued / immediate email gets an email_log row. Logging is strictly
// FAIL-OPEN and never awaited by the send path: a logging problem can never
// delay, block or fail an email. Skipped entirely when no DATABASE_URL is set
// (unit tests). Bodies are never logged (they can contain credentials/links).

function recipientsOf(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Handle to one email_log row. Every update is CHAINED onto `chain`, so a
 * row's writes reach the database strictly in order (pending → sending →
 * sent/failed) — never racing each other — while the send path never awaits.
 */
export interface EmailLogHandle {
  chain: Promise<number | null>
}

function startLog(params: SendEmailParams, maxRetries: number, queueId: string): EmailLogHandle {
  return { chain: insertLog(params, maxRetries, queueId) }
}

function insertLog(params: SendEmailParams, maxRetries: number, queueId: string): Promise<number | null> {
  if (!process.env.DATABASE_URL) return Promise.resolve(null)
  return import('../../repositories/email-log.repository')
    .then(({ createEmailLog }) => createEmailLog({
      recipientEmail: recipientsOf(params.to).join(', '),
      subject: params.subject,
      eventType: params.eventType || 'general',
      maxRetries,
      context: {
        ...params.context,
        ...(params.cc ? { cc: recipientsOf(params.cc) } : {}),
        ...(params.bcc ? { bcc: recipientsOf(params.bcc) } : {}),
        queueId,
      },
    }))
    .catch((err: Error) => {
      console.warn(`${EMAIL_QUEUE_PREFIX} email_log insert skipped: ${err.message}`)
      return null
    })
}

function markLog(
  handle: EmailLogHandle | undefined,
  values: { status: 'pending' | 'sending' | 'sent' | 'failed'; retryCount?: number; errorMessage?: string | null; fromAddress?: string | null; sentAt?: Date | null },
): void {
  if (!handle) return
  handle.chain = handle.chain.then(async (id) => {
    if (id == null) return id
    try {
      const { updateEmailLog } = await import('../../repositories/email-log.repository')
      await updateEmailLog(id, values)
    } catch (err) {
      console.warn(`${EMAIL_QUEUE_PREFIX} email_log update skipped: ${err instanceof Error ? err.message : err}`)
    }
    return id
  })
}

/** Safe, credential-free failure reason for email_log / the admin UI. */
export function describeSendError(err: unknown, fallback?: string): string {
  const statusCode = (err as { statusCode?: number })?.statusCode
  if (typeof statusCode === 'number' && statusCode > 0) return `${getGraphErrorMessage(statusCode)} (HTTP ${statusCode})`
  const message = err instanceof Error ? err.message : fallback || 'Unknown error'
  return message.length > 300 ? message.slice(0, 300) + '…' : message
}

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
    attempts: 0,
  }
  entry.logId = startLog(paramsWithEvent, entry.maxRetries, id)

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
    const items = [...queue]

    for (const entry of items) {
      try {
        const result = await sendWithRetry(entry)

        if (result.success) {
          markLog(entry.logId, { status: 'sent', retryCount: entry.attempts, sentAt: new Date(), fromAddress: result.from ?? null, errorMessage: null })
          removeFromQueue(entry.id)
          processed++
        } else if (entry.retryCount >= entry.maxRetries) {
          console.error(`${EMAIL_QUEUE_PREFIX} Permanently failed ${entry.id} after ${entry.retryCount} retries: ${entry.params.subject}`)
          markLog(entry.logId, { status: 'failed', retryCount: entry.attempts, errorMessage: describeSendError(null, result.error) })
          removeFromQueue(entry.id)
          processed++
        } else {
          markLog(entry.logId, { status: 'pending', retryCount: entry.attempts, errorMessage: describeSendError(null, result.error) })
          entry.retryCount++
          console.warn(`${EMAIL_QUEUE_PREFIX} Will retry ${entry.id} (attempt ${entry.retryCount}/${entry.maxRetries})`)
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error')
        // Structured logging for Graph errors — no secrets or tokens
        const statusCode = (err as any)?.statusCode
        const provider = (err as any)?.provider
        if (provider === 'microsoft-graph' && statusCode) {
          console.error(
            `${EMAIL_QUEUE_PREFIX} Graph error ${entry.id}: status=${statusCode} message=${getGraphErrorMessage(statusCode)}`
          )
        } else {
          console.error(`${EMAIL_QUEUE_PREFIX} Error processing ${entry.id}:`, error.message)
        }

        if (entry.retryCount >= entry.maxRetries) {
          markLog(entry.logId, { status: 'failed', retryCount: entry.attempts, errorMessage: describeSendError(err) })
          removeFromQueue(entry.id)
          processed++
        } else {
          markLog(entry.logId, { status: 'pending', retryCount: entry.attempts, errorMessage: describeSendError(err) })
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
  const result = await sendNowLogged(params)
  // Unchanged public contract: callers get a generic error, never provider internals.
  return result.success ? result : { success: false, error: 'Failed to send email' }
}

/**
 * Send once, right now (no queue/retry), recording the attempt in email_log.
 * On failure `error` is a SAFE, credential-free reason (see describeSendError)
 * — used by Admin → Email Management's "Send Test Email".
 */
export async function sendNowLogged(params: SendEmailParams): Promise<SendEmailResult> {
  const provider = getProvider()
  const logId = startLog(params, 1, `immediate_${generateEmailId()}`)
  try {
    console.log(`${EMAIL_LOG_PREFIX} Sending immediate: ${params.subject} → ${Array.isArray(params.to) ? params.to.join(', ') : params.to}`)
    markLog(logId, { status: 'sending', retryCount: 0 })
    const result = await provider.send(params)
    if (result.success) {
      console.log(`${EMAIL_LOG_PREFIX} Immediate send success: ${result.messageId}`)
      markLog(logId, { status: 'sent', retryCount: 1, sentAt: new Date(), fromAddress: result.from ?? null, errorMessage: null })
      return result
    }
    console.error(`${EMAIL_LOG_PREFIX} Immediate send failed:`, result.error)
    const reason = describeSendError(null, result.error)
    markLog(logId, { status: 'failed', retryCount: 1, errorMessage: reason })
    return { success: false, error: reason }
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error')
    console.error(`${EMAIL_LOG_PREFIX} Immediate send error:`, error.message)
    const reason = describeSendError(err)
    markLog(logId, { status: 'failed', retryCount: 1, errorMessage: reason })
    return { success: false, error: reason }
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

async function sendWithRetry(entry: EmailQueueEntry): Promise<SendEmailResult> {
  entry.attempts = (entry.attempts ?? 0) + 1
  markLog(entry.logId, { status: 'sending', retryCount: entry.attempts - 1 })
  const result = await getProvider().send(entry.params)

  if (!result.success) {
    entry.retryCount++
    if (entry.retryCount >= entry.maxRetries) {
      return result
    }
    const delay = EMAIL_RETRY.INITIAL_DELAY_MS * Math.pow(EMAIL_RETRY.BACKOFF_MULTIPLIER, entry.retryCount - 1)
    console.log(`${EMAIL_QUEUE_PREFIX} Retrying ${entry.id} in ${delay}ms (attempt ${entry.retryCount + 1}/${entry.maxRetries})...`)
    await sleep(delay)
    return sendWithRetry(entry)
  }

  return result
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
