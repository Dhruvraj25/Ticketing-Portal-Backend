import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalNotificationEvent,
  defaultNotificationEnabled,
  isNotificationEnabled,
  indexPreferences,
  filterRecipientsByPreference,
  buildUserSettings,
  isKnownNotificationEvent,
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_KEYS,
  NOTIFICATION_CHANNELS,
  type NotificationPreferenceRow,
} from '../src/lib/notification-preferences'

// ─── Catalog / alias resolution ────────────────────────────────────────────

test('prefs: every alias resolves to its canonical preference key', () => {
  assert.equal(canonicalNotificationEvent('ticket_resolved'), 'client_review')
  assert.equal(canonicalNotificationEvent('awaiting_client_review'), 'client_review')
  assert.equal(canonicalNotificationEvent('revision_requested'), 'request_for_revision')
  assert.equal(canonicalNotificationEvent('ticket_revision_requested'), 'request_for_revision')
  assert.equal(canonicalNotificationEvent('additional_hours'), 'additional_hours_requested')
  assert.equal(canonicalNotificationEvent('support_hours_assigned'), 'support_hours_added')
  assert.equal(canonicalNotificationEvent('ticket_reassigned'), 'ticket_assigned')
  // Canonical keys pass through unchanged
  assert.equal(canonicalNotificationEvent('ticket_closed'), 'ticket_closed')
  assert.equal(canonicalNotificationEvent('manager_review'), 'manager_review')
  assert.equal(canonicalNotificationEvent('rework'), 'rework')
  assert.equal(canonicalNotificationEvent('estimate_approved'), 'estimate_approved')
  // Unknown events have no canonical key
  assert.equal(canonicalNotificationEvent('made_up_event'), null)
  assert.equal(canonicalNotificationEvent(undefined), null)
})

test('prefs: catalog covers the required workflow events and channels', () => {
  for (const required of ['ticket_assigned', 'manager_review', 'client_review', 'rework', 'request_for_revision', 'ticket_closed', 'estimate_approved']) {
    assert.ok(NOTIFICATION_EVENT_KEYS.includes(required), `missing canonical event ${required}`)
  }
  assert.deepEqual(NOTIFICATION_CHANNELS, ['in_app', 'email', 'teams'])
  for (const def of NOTIFICATION_EVENTS) assert.ok(def.label && def.group)
  assert.ok(isKnownNotificationEvent('estimate_approved'))
  assert.ok(!isKnownNotificationEvent('made_up_event'))
})

// ─── Defaults preserve current behavior ────────────────────────────────────

test('prefs: in-app and email default to ON for every role', () => {
  for (const role of ['client', 'developer', 'project_manager', 'admin']) {
    assert.equal(defaultNotificationEnabled('in_app', { role }), true)
    assert.equal(defaultNotificationEnabled('email', { role }), true)
  }
})

test('prefs: teams default preserves the legacy customer switch', () => {
  // Client users: Teams OFF until the customer enables it during onboarding.
  assert.equal(defaultNotificationEnabled('teams', { role: 'client', enableTeamsNotifications: false }), false)
  assert.equal(defaultNotificationEnabled('teams', { role: 'client', enableTeamsNotifications: true }), true)
  // Internal staff always default to Teams ON.
  assert.equal(defaultNotificationEnabled('teams', { role: 'developer' }), true)
  assert.equal(defaultNotificationEnabled('teams', { role: 'project_manager' }), true)
  assert.equal(defaultNotificationEnabled('teams', { role: 'admin' }), true)
})

// ─── Explicit rows override defaults ───────────────────────────────────────

test('prefs: an explicit row overrides the channel default', () => {
  const rows: NotificationPreferenceRow[] = [
    { userId: 'u1', channel: 'email', eventType: 'ticket_closed', enabled: false },
    { userId: 'u1', channel: 'teams', eventType: 'manager_review', enabled: true },
  ]
  const indexed = indexPreferences(rows)

  // Email disabled only for ticket_closed — other email events still default ON
  assert.equal(isNotificationEnabled(indexed, 'email', 'ticket_closed', { role: 'client' }), false)
  assert.equal(isNotificationEnabled(indexed, 'email', 'ticket_created', { role: 'client' }), true)
  // In-app untouched
  assert.equal(isNotificationEnabled(indexed, 'in_app', 'ticket_closed', { role: 'client' }), true)
  // Teams: client default OFF (customer switch) but an explicit row re-enables it
  assert.equal(isNotificationEnabled(indexed, 'teams', 'manager_review', { role: 'client', enableTeamsNotifications: false }), true)
  // And an explicit disable wins over the customer switch being ON
  const rows2 = indexPreferences([{ userId: 'u1', channel: 'teams', eventType: 'ticket_closed', enabled: false }])
  assert.equal(isNotificationEnabled(rows2, 'teams', 'ticket_closed', { role: 'client', enableTeamsNotifications: true }), false)
})

test('prefs: aliases share the same preference row', () => {
  const indexed = indexPreferences([
    { userId: 'u1', channel: 'email', eventType: 'client_review', enabled: false },
  ])
  // 'ticket_resolved' and 'awaiting_client_review' spellings are governed by
  // the canonical 'client_review' preference.
  assert.equal(isNotificationEnabled(indexed, 'email', 'ticket_resolved', { role: 'client' }), false)
  assert.equal(isNotificationEnabled(indexed, 'email', 'awaiting_client_review', { role: 'client' }), false)
  assert.equal(isNotificationEnabled(indexed, 'email', 'client_review', { role: 'client' }), false)
})

test('prefs: unknown events are never silently suppressed', () => {
  const indexed = indexPreferences([{ userId: 'u1', channel: 'email', eventType: 'ticket_closed', enabled: false }])
  assert.equal(isNotificationEnabled(indexed, 'email', 'mystery_event', { role: 'client' }), true)
})

// ─── Recipient filtering ───────────────────────────────────────────────────

test('prefs: recipient filter drops only explicitly-disabled users', () => {
  const recipients = [
    { id: 'a', email: 'a@x.com', role: 'client', enableTeamsNotifications: false },
    { id: 'b', email: 'b@x.com', role: 'client', enableTeamsNotifications: false },
    { id: 'c', email: 'c@x.com', role: 'client', enableTeamsNotifications: true },
  ]
  const prefMap = new Map<string, Map<string, boolean>>([
    ['b', indexPreferences([{ userId: 'b', channel: 'email', eventType: 'ticket_closed', enabled: false }])],
  ])
  const kept = filterRecipientsByPreference(recipients as any, 'email', 'ticket_closed', prefMap)
  assert.deepEqual(kept.map(r => r.id), ['a', 'c'])
})

test('prefs: recipient filter keeps default-on staff and default teams', () => {
  const recipients = [
    { id: 'dev1', email: 'dev@x.com', role: 'developer' },
    { id: 'mgr1', email: 'mgr@x.com', role: 'project_manager' },
  ]
  const kept = filterRecipientsByPreference(recipients as any, 'teams', 'rework', new Map())
  assert.deepEqual(kept.map(r => r.id), ['dev1', 'mgr1'])
})

// ─── Settings payload builders ─────────────────────────────────────────────

test('prefs: effective settings payload covers every catalog event with defaults', () => {
  const settings = buildUserSettings(
    { role: 'client', enableTeamsNotifications: false },
    new Map<string, Map<string, boolean>>(),
    'u1',
  )
  assert.equal(settings.length, NOTIFICATION_EVENTS.length)
  for (const s of settings) {
    assert.equal(s.inApp, true)
    assert.equal(s.email, true)
    assert.equal(s.teams, false) // client, customer Teams not enabled
    assert.ok(s.label)
  }
})

test('prefs: settings payload reflects explicit rows per channel', () => {
  const byUser = new Map<string, Map<string, boolean>>([
    ['u1', indexPreferences([
      { userId: 'u1', channel: 'email', eventType: 'ticket_closed', enabled: false },
      { userId: 'u1', channel: 'teams', eventType: 'ticket_assigned', enabled: true },
    ])],
  ])
  const settings = buildUserSettings({ role: 'client', enableTeamsNotifications: false }, byUser, 'u1')
  const closed = settings.find(s => s.eventType === 'ticket_closed')!
  assert.equal(closed.email, false)
  const assigned = settings.find(s => s.eventType === 'ticket_assigned')!
  assert.equal(assigned.teams, true)
})
