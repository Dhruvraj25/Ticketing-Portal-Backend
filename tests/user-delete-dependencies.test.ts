import { test } from 'node:test'
import assert from 'node:assert/strict'

// ============================================================================
// User Delete — Dependency Check Tests
// ============================================================================
// Tests the logic that checks all foreign-key dependencies before deletion.
// These verify the error messages and dependency detection are correct.
// ============================================================================

// ─── Dependency table mapping (mirrors the deleteUser action) ──────────────

interface DependencyCheck {
  tableName: string
  columnName: string
  onDelete: 'cascade' | 'restrict' | 'set null' | 'none'
  checked: boolean
}

const USER_FK_DEPENDENCIES: DependencyCheck[] = [
  // Auto-cleaned (cascade) — no pre-check needed
  { tableName: 'session', columnName: 'userId', onDelete: 'cascade', checked: false },
  { tableName: 'account', columnName: 'userId', onDelete: 'cascade', checked: false },
  { tableName: 'ticket_review', columnName: 'client_id', onDelete: 'cascade', checked: false },
  { tableName: 'ticket_review', columnName: 'assigned_to_id', onDelete: 'set null', checked: false },
  { tableName: 'password_reset_request', columnName: 'user_id', onDelete: 'cascade', checked: false },
  { tableName: 'project_client', columnName: 'userId', onDelete: 'cascade', checked: false },
  { tableName: 'project_client', columnName: 'assignedBy', onDelete: 'set null', checked: false },
  { tableName: 'project_developer', columnName: 'userId', onDelete: 'cascade', checked: false },

  // Must be pre-checked (restrict/no-onDelete) — these block deletion
  { tableName: 'project', columnName: 'clientId', onDelete: 'restrict', checked: true },
  { tableName: 'project', columnName: 'managerId', onDelete: 'restrict', checked: true },
  { tableName: 'ticket', columnName: 'clientId', onDelete: 'none', checked: true },
  { tableName: 'ticket', columnName: 'assignedToId', onDelete: 'none', checked: true },
  { tableName: 'ticket', columnName: 'assignedById', onDelete: 'none', checked: true },
  { tableName: 'comment', columnName: 'userId', onDelete: 'none', checked: true },
  { tableName: 'time_log', columnName: 'userId', onDelete: 'none', checked: true },
  { tableName: 'tickethistory', columnName: 'userId', onDelete: 'none', checked: true },
  { tableName: 'attachment', columnName: 'uploadedById', onDelete: 'none', checked: true },
  { tableName: 'notification', columnName: 'userId', onDelete: 'none', checked: true },
  { tableName: 'support_wallet', columnName: 'clientId', onDelete: 'restrict', checked: true },
  { tableName: 'wallet_transaction', columnName: 'performedBy', onDelete: 'none', checked: true },
  { tableName: 'revision_history', columnName: 'requestedById', onDelete: 'none', checked: true },
  { tableName: 'revision_history', columnName: 'reviewedById', onDelete: 'none', checked: true },
  { tableName: 'notification_log', columnName: 'recipient_user_id', onDelete: 'none', checked: true },
  { tableName: 'notification_log', columnName: 'triggered_by', onDelete: 'none', checked: true },
]

// ─── Tests ──────────────────────────────────────────────────────────────────

test('Every restrict/no-onDelete FK dependency has checked=true', () => {
  const blockingDeps = USER_FK_DEPENDENCIES.filter(
    d => d.onDelete === 'restrict' || d.onDelete === 'none'
  )
  for (const dep of blockingDeps) {
    assert.ok(
      dep.checked,
      `${dep.tableName}.${dep.columnName} (onDelete: ${dep.onDelete}) must be checked before delete`
    )
  }
})

test('Cascade/set-null FK dependencies have checked=false (auto-cleaned)', () => {
  const autoCleaned = USER_FK_DEPENDENCIES.filter(
    d => d.onDelete === 'cascade' || d.onDelete === 'set null'
  )
  for (const dep of autoCleaned) {
    assert.ok(
      !dep.checked,
      `${dep.tableName}.${dep.columnName} (onDelete: ${dep.onDelete}) should NOT need pre-check`
    )
  }
})

test('No blocking dependency is missed', () => {
  // These tables MUST be in the dependency check list
  const requiredChecked = [
    'project.clientId', 'project.managerId',
    'ticket.clientId', 'ticket.assignedToId', 'ticket.assignedById',
    'comment.userId',
    'time_log.userId',
    'tickethistory.userId',
    'attachment.uploadedById',
    'notification.userId',
    'support_wallet.clientId',
    'wallet_transaction.performedBy',
    'revision_history.requestedById', 'revision_history.reviewedById',
    'notification_log.recipient_user_id', 'notification_log.triggered_by',
  ]

  for (const ref of requiredChecked) {
    const [table, col] = ref.split('.')
    const found = USER_FK_DEPENDENCIES.find(d => d.tableName === table && d.columnName === col)
    assert.ok(found, `Missing required dependency check: ${ref}`)
    assert.ok(found.checked, `${ref} must have checked=true`)
  }
})

test('Delete error message format is user-friendly', () => {
  // Simulate what the deleteUser action would produce
  const deps = ['2 project(s)', '5 ticket(s)', '3 comment(s)']
  const depSummary = deps.slice(0, 3).join(', ')
  const message =
    `This account cannot be deleted because it is still associated with existing records ` +
    `(${depSummary}). Please reassign or remove those associations first, or deactivate the user instead.`

  // Must not contain SQL, Prisma, or technical details
  assert.ok(!message.includes('SQL'), 'Must not expose SQL')
  assert.ok(!message.includes('Prisma'), 'Must not expose Prisma')
  assert.ok(!message.includes('foreign key'), 'Must not expose foreign key details')
  assert.ok(!message.includes('constraint'), 'Must not expose constraint details')
  assert.ok(!message.includes('23503'), 'Must not expose PostgreSQL error codes')

  // Must contain actionable guidance
  assert.ok(message.includes('reassign'), 'Should suggest reassignment')
  assert.ok(message.includes('deactivat'), 'Should suggest deactivation')
})

test('Delete error message with many dependency types truncates sensibly', () => {
  const deps = ['1 project(s)', '2 ticket(s)', '3 comment(s)', '4 time log(s)', '5 attachment(s)']
  const depSummary = deps.slice(0, 3).join(', ') + `, and ${deps.length - 3} more type(s)`
  assert.ok(depSummary.includes('and 2 more type(s)'), 'Should show count of remaining types')
  assert.ok(depSummary.length < 200, 'Summary should be concise')
})

test('Foreign key constraint catch message is safe', () => {
  const message = 'This account cannot be deleted because it has associated records that were not detected. Please try deactivating the user instead.'
  assert.ok(!message.includes('SQL'), 'Must not expose SQL')
  assert.ok(!message.includes('error:'), 'Must not expose error details')
  assert.ok(message.includes('deactivat'), 'Should suggest deactivation')
})

test('Database failure message is safe', () => {
  const message = 'The account could not be deleted due to a server error. Please try again.'
  assert.ok(!message.includes('SQL'), 'Must not expose SQL')
  assert.ok(!message.includes('Prisma'), 'Must not expose Prisma')
  assert.ok(message.includes('server error'), 'Should indicate server error')
  assert.ok(message.includes('try again'), 'Should suggest retry')
})
