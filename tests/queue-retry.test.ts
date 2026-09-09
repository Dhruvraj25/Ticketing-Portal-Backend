import { test } from 'node:test'
import assert from 'node:assert/strict'

// ============================================================================
// Queue retry termination — regression for the sendWithRetry deadlock
// ============================================================================
// ROOT-CAUSE FIX: both queues' sendWithRetry() recursed while
// `entry.retryCount < entry.maxRetries` but NEVER incremented retryCount
// inside the recursion. A provider/webhook that persistently fails — the
// Teams webhook client RESOLVES with {success:false} on HTTP/network errors
// and never throws, and the Resend provider resolves {success:false} after
// catching its own errors — therefore retried FOREVER with growing backoff.
// isProcessing stayed true, processQueue() returned 0 for every later call,
// and the queue was PERMANENTLY STUCK: every subsequent notification was
// enqueued but never delivered.
//
// These tests prove the fixed queues terminate after maxRetries and remove
// the failed item (queue drains back to depth 0) instead of hanging.
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function waitForQueueDrain(getDepth: () => number, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (getDepth() > 0 && Date.now() < deadline) {
    await sleep(100)
  }
}

test('teams queue: persistent webhook failure terminates after maxRetries (no deadlock)', async () => {
  // Port 9 is the discard port — the webhook POST is refused immediately,
  // so every attempt fails fast and deterministically.
  process.env.TEAMS_WEBHOOK_URL = 'https://127.0.0.1:9/fail'

  const teamsQueue = await import('../src/services/teams/teams-queue')
  const before = teamsQueue.getQueueStats().totalFailed

  teamsQueue.enqueue(
    'test_message' as any,
    {} as any,
    { type: 'AdaptiveCard', version: '1.0', body: [] } as any,
    '',
    '',
  )

  // enqueue() fires background processing; wait for it to drain (maxRetries=3
  // with 1s/2s backoff ≈ 3.5s worst case).
  await waitForQueueDrain(() => teamsQueue.getQueueDepth())

  assert.equal(teamsQueue.getQueueDepth(), 0, 'the failed item must be removed — the queue must not stay stuck')
  assert.ok(
    teamsQueue.getQueueStats().totalFailed > before,
    'the persistently failing item must be counted as permanently failed (not retried forever)',
  )
})

test('email queue: a provider that resolves {success:false} terminates after maxRetries (no deadlock)', async () => {
  const emailProvider = await import('../src/services/email/email.provider')

  // Provider that always RESOLVES with {success:false} — the exact path that
  // previously recursed forever (the queue never saw a throw).
  emailProvider.registerProvider('always-fail', {
    name: 'always-fail',
    async send() {
      return { success: false, error: 'simulated persistent failure' }
    },
    async verifyConnection() {
      return true
    },
  })
  process.env.EMAIL_PROVIDER = 'always-fail'

  const emailQueue = await import('../src/services/email/email.queue')
  emailQueue.enqueue(
    {
      from: 'support@example.com',
      to: 'client@example.com',
      subject: 'Retry termination test',
      html: '<p>hi</p>',
    } as any,
    'general',
  )

  await waitForQueueDrain(() => emailQueue.getQueueDepth())

  assert.equal(emailQueue.getQueueDepth(), 0, 'the failed email must be removed — the queue must not stay stuck')
})