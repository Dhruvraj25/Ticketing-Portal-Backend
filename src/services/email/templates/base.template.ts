// ============================================================================
// Email Template Engine — Base Template
// ============================================================================
//
// Provides a reusable HTML email template engine with:
//   - Reusable header and footer
//   - Company branding support
//   - Responsive layout (inline CSS)
//   - Dark mode compatible
//   - Plain text fallback
//   - Consistent typography
//   - Dynamic placeholders
//
// All email templates should use these base functions to ensure
// consistent branding and layout across all email types.
//
// IMPORTANT: All user-supplied values MUST be escaped to prevent
// HTML injection. Use escapeHtml() for any dynamic content.
// ============================================================================

// ─── Branding Configuration ─────────────────────────────────────────────────

export interface BrandingConfig {
  companyName: string
  companyLogoUrl?: string
  primaryColor?: string
  secondaryColor?: string
  portalUrl?: string
}

const DEFAULT_BRANDING: BrandingConfig = {
  companyName: 'SupportHub',
  primaryColor: '#2563EB',
  secondaryColor: '#6366F1',
  portalUrl: 'https://supporthub.app',
}

// ─── HTML Escaping (Security) ───────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent injection attacks.
 * Use this for ALL user-supplied content rendered in email templates.
 */
export function escapeHtml(value: string | number | undefined | null): string {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Escape a URL for use in email HTML attributes.
 * Strips javascript: and other dangerous URL schemes.
 */
export function escapeUrl(url: string | undefined | null): string {
  if (!url) return '#'
  const lower = url.toLowerCase().trim()
  // Block dangerous URL schemes
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return '#'
  }
  return escapeHtml(url)
}

// ─── Branding Helpers ───────────────────────────────────────────────────────

export function getBranding(): BrandingConfig {
  return {
    companyName: process.env.COMPANY_NAME || DEFAULT_BRANDING.companyName,
    companyLogoUrl: process.env.COMPANY_LOGO_URL || DEFAULT_BRANDING.companyLogoUrl,
    primaryColor: process.env.PRIMARY_COLOR || DEFAULT_BRANDING.primaryColor,
    secondaryColor: process.env.SECONDARY_COLOR || DEFAULT_BRANDING.secondaryColor,
    portalUrl: process.env.PORTAL_URL || DEFAULT_BRANDING.portalUrl,
  }
}

// ─── Base Template Functions ────────────────────────────────────────────────

/**
 * Create the full HTML email document with header, content, and footer.
 * This is the main wrapper that all templates should use.
 *
 * @param content - The inner HTML content (body of the email)
 * @param branding - Optional branding overrides
 * @returns Complete HTML email document as a string
 */
export function baseWrapper(content: string, branding?: BrandingConfig): string {
  const brand = { ...DEFAULT_BRANDING, ...branding }
  const logo = brand.companyLogoUrl
    ? `<img src="${escapeUrl(brand.companyLogoUrl)}" alt="${escapeHtml(brand.companyName)}" style="display:block;max-width:160px;height:auto;margin:0 auto 24px;border:0" />`
    : ''

  const primaryColor = brand.primaryColor || '#2563EB'

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(brand.companyName)}</title>
<style type="text/css">
  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .email-body { background-color: #1a1a2e !important; }
    .email-container { background-color: #16213e !important; }
    .email-content { color: #e2e8f0 !important; }
    .email-heading { color: #f1f5f9 !important; }
    .email-label { color: #94a3b8 !important; }
    .email-value { color: #e2e8f0 !important; }
    .email-footer { color: #64748b !important; }
  }
  /* Email client reset */
  .ExternalClass, .ReadMsgBody { width: 100%; }
  .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }
  body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse; mso-table-lspace: 0; mso-table-rspace: 0; }
  img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased" class="email-body">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;min-width:100%">
<tr>
<td align="center" style="padding:40px 16px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
    <!-- Logo Area -->
    <tr>
      <td align="center" style="padding-bottom:24px">
        ${logo}
      </td>
    </tr>
    <!-- Card Container -->
    <tr>
      <td style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08),0 1px 2px rgba(0,0,0,0.04)" class="email-container">
        <!-- Color Accent Bar -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="height:4px;background:${primaryColor};font-size:0;line-height:0"></td>
          </tr>
        </table>
        <!-- Content -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:32px 32px 24px" class="email-content">
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding:24px 16px 0;text-align:center" class="email-footer">
        <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#9ca3af">
          ${escapeHtml(brand.companyName)} &mdash; SupportHub Portal
        </p>
        <p style="margin:0;font-size:12px;line-height:18px;color:#d1d5db">
          This is an automated notification. Please do not reply to this email.
        </p>
        ${brand.portalUrl ? `<p style="margin:8px 0 0;font-size:12px;line-height:18px;color:#d1d5db">
          <a href="${escapeUrl(brand.portalUrl)}" target="_blank" style="color:#9ca3af;text-decoration:underline">${escapeHtml(brand.portalUrl)}</a>
        </p>` : ''}
      </td>
    </tr>
  </table>
</td>
</tr>
</table>
</body>
</html>`
}

/**
 * Generate plain text fallback from HTML content (strips tags).
 * Used for the text version of multipart emails.
 */
export function generatePlainText(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Helper Components ──────────────────────────────────────────────────────

/**
 * Create an email heading (h1).
 */
export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;line-height:30px" class="email-heading">${text}</h1>`
}

/**
 * Create a paragraph of text.
 */
export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:24px" class="email-value">${text}</p>`
}

/**
 * Create a small text block (for secondary information).
 */
export function emailSmallText(text: string): string {
  return `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;line-height:20px" class="email-label">${text}</p>`
}

/**
 * Create a labeled field row for use inside a field table.
 */
export function emailFieldRow(label: string, value: string): string {
  return `<tr>
  <td style="padding:4px 0;font-size:14px;color:#374151;line-height:22px" class="email-value">
    <span style="font-weight:600;color:#6b7280;display:inline-block;min-width:80px;margin-right:8px" class="email-label">${label}:</span> ${value}
  </td>
</tr>`
}

/**
 * Create a complete field table from field rows.
 */
export function emailFieldTable(rows: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;width:100%">
  <tbody>
    ${rows}
  </tbody>
</table>`
}

/**
 * Create a call-to-action button.
 */
export function emailButton(text: string, url: string, branding?: BrandingConfig): string {
  const brand = { ...DEFAULT_BRANDING, ...branding }
  const primaryColor = brand.primaryColor || '#2563EB'
  const safeUrl = escapeUrl(url)

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 16px">
  <tr>
    <td align="center" style="background:${primaryColor};border-radius:8px;padding:0">
      <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;line-height:22px;letter-spacing:0.3px">
        ${escapeHtml(text)}
      </a>
    </td>
  </tr>
</table>`
}

/**
 * Create a subtle divider line.
 */
export function emailDivider(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0">
  <tr>
    <td style="height:1px;background:#e5e7eb;font-size:0;line-height:0"></td>
  </tr>
</table>`
}

/**
 * Create an info box (highlighted background card).
 */
export function emailInfoBox(content: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">
  <tr>
    <td style="padding:16px 20px;font-size:14px;color:#374151;line-height:22px" class="email-value">
      ${content}
    </td>
  </tr>
</table>`
}

/**
 * Create a ticket metadata table (common pattern: Ticket #, Title, Project, etc.)
 */
export function ticketMetaTable(
  ticketNumber: string,
  ticketTitle: string,
  extras?: { label: string; value: string }[],
): string {
  const extraRows = extras
    ? extras.map(e => emailFieldRow(e.label, e.value)).join('\n')
    : ''

  return emailFieldTable(
    emailFieldRow('Ticket', `#${escapeHtml(ticketNumber)}`) +
    emailFieldRow('Title', escapeHtml(ticketTitle)) +
    extraRows,
  )
}
