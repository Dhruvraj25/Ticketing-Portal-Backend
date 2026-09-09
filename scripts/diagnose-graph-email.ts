// ============================================================================
// Microsoft Graph email diagnostic (read-only unless SEND_TEST=1)
// ============================================================================
// Reuses the EXISTING microsoft-graph.provider.ts code paths — does not
// duplicate credential/client construction logic where avoidable.
// NEVER logs: access token, client secret, or full JWT.
// ============================================================================
import 'dotenv/config'
import { ClientSecretCredential } from '@azure/identity'
import { microsoftGraphProvider, sendMicrosoftGraphEmail } from '../src/services/email/providers/microsoft-graph.provider'

function decodeJwtPayloadSafely(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(payload)
  } catch {
    return null
  }
}

async function main() {
  console.log('=== Microsoft Graph Email Diagnostic ===\n')

  // ── Step A: env presence (booleans only, never values) ──────────────────
  const envKeys = ['EMAIL_PROVIDER', 'MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_SENDER_EMAIL'] as const
  for (const k of envKeys) {
    const v = process.env[k]
    console.log(`${k}: ${v ? 'configured' : 'MISSING'}`)
  }
  console.log()

  const tenantId = process.env.MICROSOFT_TENANT_ID!
  const clientId = process.env.MICROSOFT_CLIENT_ID!
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!
  const senderEmail = process.env.MICROSOFT_SENDER_EMAIL!

  // ── Step B: reuse the existing provider's verifyConnection() ────────────
  console.log('--- Step B: microsoftGraphProvider.verifyConnection() (existing code) ---')
  const verified = await microsoftGraphProvider.verifyConnection()
  console.log(`token acquired via existing provider.verifyConnection(): ${verified ? 'YES' : 'NO'}\n`)

  // ── Step C: acquire our own token (same credential class/params) purely
  //    to inspect SAFE, non-secret claims (aud/roles/appid/tid) — never logs
  //    the token itself. ──────────────────────────────────────────────────
  console.log('--- Step C: token claim inspection (aud / roles / appid / tid only) ---')
  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret)
  try {
    const token = await credential.getToken('https://graph.microsoft.com/.default')
    if (!token?.token) {
      console.log('token acquired: NO (empty token returned)')
    } else {
      console.log('token acquired: YES')
      const claims = decodeJwtPayloadSafely(token.token)
      if (!claims) {
        console.log('could not decode token payload (unexpected format)')
      } else {
        console.log(`aud (audience): ${claims.aud}`)
        console.log(`aud is Microsoft Graph: ${claims.aud === 'https://graph.microsoft.com' ? 'YES' : 'NO'}`)
        console.log(`appid matches configured MICROSOFT_CLIENT_ID: ${claims.appid === clientId ? 'YES' : 'NO'}`)
        console.log(`tid matches configured MICROSOFT_TENANT_ID: ${claims.tid === tenantId ? 'YES' : 'NO'}`)
        const roles = Array.isArray(claims.roles) ? (claims.roles as string[]) : []
        console.log(`application permissions (roles claim): ${roles.length > 0 ? roles.join(', ') : '(none)'}`)
        console.log(`Mail.Send present in token roles: ${roles.includes('Mail.Send') ? 'YES' : 'NO'}`)
        console.log(`token type: ${claims.idtyp === 'app' ? 'application (app-only)' : String(claims.idtyp ?? 'unknown')}`)
      }
    }
  } catch (err) {
    const e = err as any
    console.log('token acquired: NO')
    console.log(`error name: ${e?.name ?? 'unknown'}`)
    console.log(`error message: ${e?.message ?? String(err)}`)
    // Azure Identity errors sometimes carry an errorResponse with a code.
    if (e?.errorResponse?.error) console.log(`error code: ${e.errorResponse.error}`)
  }
  console.log()

  // ── Step D: safe Graph call — resolve the sender mailbox (GET, no send) ─
  console.log(`--- Step D: GET /users/${senderEmail} (confirms the mailbox resolves in this tenant) ---`)
  try {
    const token = await credential.getToken('https://graph.microsoft.com/.default')
    const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}`, {
      headers: { Authorization: `Bearer ${token!.token}` },
    })
    console.log(`HTTP status: ${resp.status}`)
    if (resp.ok) {
      const body = await resp.json()
      console.log(`mailbox resolved: YES (id present: ${!!body.id}, mail: ${body.mail ?? body.userPrincipalName ?? '(none returned)'})`)
    } else {
      const body = await resp.json().catch(() => null)
      console.log(`mailbox resolved: NO`)
      console.log(`Graph error code: ${body?.error?.code ?? '(none)'}`)
      console.log(`Graph error message: ${body?.error?.message ?? '(none)'}`)
    }
  } catch (err) {
    console.log(`GET /users/{sender} request failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  console.log()

  // ── Step E: OPTIONAL real send — only when explicitly requested ─────────
  const testTo = process.env.SEND_TEST_TO
  if (process.env.SEND_TEST === '1' && testTo) {
    console.log(`--- Step E: sending ONE real test email via the EXISTING sendMicrosoftGraphEmail() to ${testTo} ---`)
    try {
      const result = await sendMicrosoftGraphEmail({
        to: testTo,
        subject: 'Support Hero — Microsoft Graph delivery diagnostic',
        html: '<p>This is a one-time diagnostic email sent directly through the existing Microsoft Graph provider code path to confirm end-to-end delivery.</p>',
      })
      console.log('sendMicrosoftGraphEmail() resolved WITHOUT throwing.')
      console.log(`result: ${JSON.stringify(result)}`)
      console.log('NOTE: Graph\'s /sendMail endpoint returns HTTP 202 with an EMPTY body by design — there is no real Graph message ID to report. A non-throwing resolve here means Graph ACCEPTED the request; it does not by itself prove final mailbox delivery.')
    } catch (err) {
      const e = err as any
      console.log('sendMicrosoftGraphEmail() THREW — Graph rejected the request or a prior step failed.')
      console.log(`error name: ${e?.name ?? 'unknown'}`)
      console.log(`error message: ${e?.message ?? String(err)}`)
      console.log(`HTTP status (if present): ${e?.statusCode ?? e?.status ?? '(none)'}`)
      console.log(`Graph error code (if present): ${e?.code ?? e?.body?.error?.code ?? '(none)'}`)
    }
  } else {
    console.log('--- Step E: skipped (set SEND_TEST=1 and SEND_TEST_TO=<address> to actually send one test email) ---')
  }

  console.log('\n=== Diagnostic complete ===')
}

main().catch((err) => {
  console.error('Diagnostic script crashed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
