// ============================================================================
// Email Template Overrides — admin-customized templates (Email Management)
// ============================================================================
// Rendering order used by email.service.ts send():
//   1. An ACTIVE admin-customized template for the event (email_templates) →
//      its subject/body are rendered with the SAME data object the code
//      template receives, and the body is wrapped in the existing branded
//      baseWrapper (header/footer).
//   2. Otherwise → the built-in code template (unchanged).
// Then the email continues through the existing queue → provider (Graph).
//
// send() is synchronous, so overrides are served from an in-memory cache that
// is loaded at startup, refreshed periodically (multi-instance safety) and
// refreshed immediately after an admin edits/resets a template.
// ============================================================================

import { baseWrapper, escapeHtml, getBranding } from './templates/base.template'

export interface TemplateOverride {
  eventType: string
  name: string
  subject: string
  htmlBody: string
  textBody: string | null
  isActive: boolean
  updatedAt?: Date | string | null
  updatedBy?: string | null
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 60_000
let overrides = new Map<string, TemplateOverride>()
let refreshTimer: ReturnType<typeof setInterval> | null = null

/** Replace the whole cache (used by refresh; also by tests). */
export function setTemplateOverrides(rows: TemplateOverride[]): void {
  overrides = new Map(rows.map((r) => [r.eventType, r]))
}

/** Active override for an event, or null → use the built-in code template. */
export function getActiveTemplateOverride(eventType: string | undefined): TemplateOverride | null {
  if (!eventType) return null
  const o = overrides.get(eventType)
  return o && o.isActive ? o : null
}

export async function refreshTemplateOverrides(): Promise<void> {
  if (!process.env.DATABASE_URL) return
  try {
    const { listEmailTemplateOverrides } = await import('../../repositories/email-template.repository')
    setTemplateOverrides(await listEmailTemplateOverrides())
  } catch (err) {
    // Keep the last good cache; code templates remain the fallback.
    console.warn('[Email][Templates] Override refresh failed (keeping current cache):', err instanceof Error ? err.message : err)
  }
}

export async function initTemplateOverrides(): Promise<void> {
  await refreshTemplateOverrides()
  if (!refreshTimer) {
    refreshTimer = setInterval(() => { refreshTemplateOverrides().catch(() => {}) }, REFRESH_INTERVAL_MS)
    refreshTimer.unref?.()
  }
  console.log(`[Email][Templates] ${overrides.size} customized template(s) loaded`)
}

// ─── Placeholders ───────────────────────────────────────────────────────────

const TOKEN_RE = /\{\{\s*([^{}]*?)\s*\}\}/g
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/
/** Global placeholders every template may use (resolved from branding when the data lacks them). */
export const GLOBAL_TEMPLATE_VARIABLES = ['companyName'] as const

function valueFor(data: Record<string, unknown>, key: string): string {
  let v = data[key]
  if ((v === undefined || v === null || v === '') && key === 'companyName') v = getBranding().companyName
  if (v === undefined || v === null) return ''
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ')
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return ''
  return String(v)
}

/** Replace {{name}} tokens with the send-time data. HTML-escapes values when `html`. */
export function renderPlaceholders(template: string, data: object, html: boolean): string {
  const record = data as Record<string, unknown>
  return template.replace(TOKEN_RE, (_m, name: string) => {
    const value = valueFor(record, name)
    return html ? escapeHtml(value) : value
  })
}

/** Render a full email (subject + branded HTML + optional text) from an override. */
export function renderTemplateOverride(o: Pick<TemplateOverride, 'subject' | 'htmlBody' | 'textBody'>, data: object) {
  return {
    subject: renderPlaceholders(o.subject, data, false),
    html: baseWrapper(renderPlaceholders(o.htmlBody, data, true), getBranding()),
    text: o.textBody ? renderPlaceholders(o.textBody, data, false) : undefined,
  }
}

// ─── Validation ─────────────────────────────────────────────────────────────

export const TEMPLATE_LIMITS = { name: 120, subject: 200, htmlBody: 50_000, textBody: 20_000 } as const

// The admin edits the email CONTENT only; the branded document shell
// (<html>/<body>, header, footer) is added by baseWrapper at send time.
const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'col', 'colgroup', 'div', 'em', 'font',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strike',
  'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
])
const SAFE_URL_RE = /^(https?:\/\/|mailto:|tel:|#|\/)/i

function checkPlaceholders(field: string, text: string, allowed: Set<string>, errors: string[]): void {
  const unknown = new Set<string>()
  for (const m of text.matchAll(TOKEN_RE)) {
    const name = m[1]
    if (!NAME_RE.test(name)) errors.push(`${field}: "{{${name}}}" is not a valid placeholder.`)
    else if (!allowed.has(name)) unknown.add(name)
  }
  if (unknown.size > 0) {
    errors.push(`${field}: unsupported variable(s) for this template: ${[...unknown].map((n) => `{{${n}}}`).join(', ')}.`)
  }
  const leftover = text.replace(TOKEN_RE, '')
  if (leftover.includes('{{') || leftover.includes('}}')) {
    errors.push(`${field}: contains an unclosed or malformed {{placeholder}}.`)
  }
}

/** Returns a list of problems; unsafe HTML is REJECTED, never silently rewritten. */
export function validateEmailHtml(htmlBody: string): string[] {
  const errors: string[] = []
  const tags = new Set<string>()
  for (const m of htmlBody.matchAll(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/g)) tags.add(m[1].toLowerCase())
  const disallowed = [...tags].filter((t) => !ALLOWED_TAGS.has(t))
  if (disallowed.length > 0) {
    errors.push(`Body: these HTML tags are not allowed in email content: ${disallowed.map((t) => `<${t}>`).join(', ')}.`)
  }
  if (/\son[a-z]+\s*=/i.test(htmlBody)) errors.push('Body: event-handler attributes (onclick, onload, …) are not allowed.')
  if (/(java|vb)script\s*:/i.test(htmlBody)) errors.push('Body: javascript:/vbscript: URLs are not allowed.')
  if (/data\s*:\s*text\/html/i.test(htmlBody)) errors.push('Body: data:text/html URLs are not allowed.')
  if (/expression\s*\(/i.test(htmlBody)) errors.push('Body: CSS expression() is not allowed.')
  if (/<!\[CDATA\[|<\?/i.test(htmlBody)) errors.push('Body: CDATA sections and processing instructions are not allowed.')
  for (const m of htmlBody.matchAll(/\s(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const url = (m[3] ?? m[4] ?? m[5] ?? '').trim()
    if (url === '' || /^\{\{\s*[A-Za-z][A-Za-z0-9_]*\s*\}\}/.test(url)) continue
    if (!SAFE_URL_RE.test(url)) errors.push(`Body: ${m[1]}="${url.slice(0, 60)}" must be an http(s), mailto or tel link, or a {{placeholder}}.`)
  }
  return errors
}

export interface TemplateInput {
  name: unknown
  subject: unknown
  htmlBody: unknown
  textBody?: unknown
  isActive?: unknown
}

export function validateTemplateInput(
  input: TemplateInput,
  allowedVariables: string[],
): { ok: true; value: Omit<TemplateOverride, 'eventType'> } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const name = str(input.name).trim()
  const subject = str(input.subject).trim()
  const htmlBody = str(input.htmlBody).trim()
  const textBody = str(input.textBody).trim()
  const isActive = input.isActive === undefined ? true : input.isActive === true

  if (!name) errors.push('Template name is required.')
  if (name.length > TEMPLATE_LIMITS.name) errors.push(`Template name must be ${TEMPLATE_LIMITS.name} characters or fewer.`)
  if (!subject) errors.push('Subject cannot be empty.')
  if (subject.length > TEMPLATE_LIMITS.subject) errors.push(`Subject must be ${TEMPLATE_LIMITS.subject} characters or fewer.`)
  if (/[\r\n]/.test(subject)) errors.push('Subject must be a single line.')
  if (/<[a-zA-Z/!]/.test(subject)) errors.push('Subject cannot contain HTML.')
  if (!htmlBody || !htmlBody.replace(/<[^>]*>/g, '').trim()) errors.push('Body cannot be empty.')
  if (htmlBody.length > TEMPLATE_LIMITS.htmlBody) errors.push(`Body must be ${TEMPLATE_LIMITS.htmlBody} characters or fewer.`)
  if (textBody.length > TEMPLATE_LIMITS.textBody) errors.push(`Plain-text body must be ${TEMPLATE_LIMITS.textBody} characters or fewer.`)
  if (input.isActive !== undefined && typeof input.isActive !== 'boolean') errors.push('isActive must be true or false.')

  const allowed = new Set<string>([...allowedVariables, ...GLOBAL_TEMPLATE_VARIABLES])
  if (subject) checkPlaceholders('Subject', subject, allowed, errors)
  if (htmlBody) {
    checkPlaceholders('Body', htmlBody, allowed, errors)
    errors.push(...validateEmailHtml(htmlBody))
  }
  if (textBody) checkPlaceholders('Plain-text body', textBody, allowed, errors)

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: { name, subject, htmlBody, textBody: textBody || null, isActive } }
}
