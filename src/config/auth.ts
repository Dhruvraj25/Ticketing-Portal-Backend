import { betterAuth } from 'better-auth'
import { pool } from './db'
import { db } from './db'
import { user as userTable } from '../models/schema'
import { and, eq } from 'drizzle-orm'
import { getFrontendUrl } from '../utils/frontend-url'
import { normalizeEmail } from '../utils/email'

// ─── Session Cookie Name Resolution ────────────────────────────────────────
// ROOT-CAUSE FIX (verified end-to-end, see audit):
//
// The session cookie is CREATED by the Frontend's Better Auth instance (Next.js
// on Vercel, https baseURL) and is therefore named
// "__Secure-better-auth.session_token". This Backend instance only VALIDATES
// that cookie. Better Auth derives the "__Secure-" prefix from THIS instance's
// own baseURL scheme — which falls back to `http://localhost:${PORT}` when
// BETTER_AUTH_URL is unset (the default on Railway). An http baseURL yields the
// UNPREFIXED name "better-auth.session_token", so the backend looks for a
// cookie the browser never sent: every session lookup returns null → 401
// "session_invalid" while the Railway log shows hasCookie=true.
//
// Fix: pin useSecureCookies to the FRONTEND's scheme (not this instance's
// baseURL). In production the frontend is always https (Vercel) → secure
// prefix → matches the cookie the browser holds. In local dev the frontend is
// http://localhost:3000 → unprefixed → matches the dev cookie. Reproduced
// with better-auth@1.6.14: same secret + same DB, http baseURL → NULL,
// https baseURL → SUCCESS.
const AUTH_FRONTEND_URL = getFrontendUrl()
const AUTH_USE_SECURE_COOKIES =
  AUTH_FRONTEND_URL.startsWith('https://') || process.env.NODE_ENV === 'production'

console.log(
  '[AuthConfig] ' +
  `frontendUrl=${AUTH_FRONTEND_URL} ` +
  `sessionCookieName=${AUTH_USE_SECURE_COOKIES ? '__Secure-better-auth.session_token' : 'better-auth.session_token'} ` +
  `baseURL=${process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 4000}`}`,
)
// Database fingerprint — compare with Frontend's [DB] log to confirm same database
try {
  const dbUrl = process.env.DATABASE_URL
  if (dbUrl) {
    const url = new URL(dbUrl)
    console.log(`[DB] DATABASE_HOST=${url.hostname} DATABASE_NAME=${url.pathname.replace('/', '')}`)
  } else {
    console.log('[DB] DATABASE_URL=MISSING')
  }
} catch {
  console.log('[DB] DATABASE_URL=INVALID')
}

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 4000}`,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    disableSignUp: false,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'client',
        input: false,
      },
      // User profile fields — persisted on the user row and returned in the
      // session user so the frontend always sees the latest values.
      about: {
        type: 'string',
        input: false,
      },
      timezone: {
        type: 'string',
        input: false,
      },
    },
  },
  trustedOrigins: [getFrontendUrl()],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  // See AUTH_USE_SECURE_COOKIES above — must mirror the FRONTEND instance's
  // cookie name so sessions issued by the frontend validate here.
  advanced: {
    useSecureCookies: AUTH_USE_SECURE_COOKIES,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (userRecord) => {
          // Normalize email casing so User@Company.com and user@company.com
          // can never create two accounts.
          if (userRecord.email) {
            userRecord.email = normalizeEmail(userRecord.email)
          }
          return { data: userRecord }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const [userData] = await db
            .select({ banned: userTable.banned, welcomeEmailSent: userTable.welcomeEmailSent, name: userTable.name, email: userTable.email })
            .from(userTable)
            .where(eq(userTable.id, session.userId))
            .limit(1)
          if (userData?.banned) {
            throw new Error('Your account has been deactivated.')
          }

          // Fire-and-forget: send Welcome Email on first login
          if (userData && !userData.welcomeEmailSent) {
            sendWelcomeEmailForUser(session.userId, userData.name, userData.email).catch((err: Error) => {
              console.error(`[WelcomeEmail] Failed - User: ${userData.name}, Email: ${userData.email}, Reason: ${err.message}`)
            })
          }

          return { data: session }
        },
      },
    },
  },
  // Normalize email casing on auth endpoints so login, registration, and
  // password reset are all case-insensitive.
  plugins: [
    {
      id: 'email-case-normalization',
      hooks: {
        before: [
          {
            matcher(context: any) {
              return ['/sign-in/email', '/sign-up/email', '/request-password-reset'].includes(context.path || '')
            },
            handler: async (ctx: any) => {
              const body = ctx.context?.body
              if (body && typeof body.email === 'string') {
                body.email = normalizeEmail(body.email)
              }
            },
          },
        ],
      },
    } as any,
  ],
})

// ─── Welcome Email Helper (Backend) ─────────────────────────────────────────
// Fires after first successful login session creation.
// Atomic UPDATE prevents duplicate sends under concurrent logins.

async function sendWelcomeEmailForUser(userId: string, userName: string, userEmail: string): Promise<void> {
  try {
    // Atomically claim the flag — only succeeds if welcomeEmailSent is currently false
    const [updated] = await db
      .update(userTable)
      .set({ welcomeEmailSent: true, updatedAt: new Date() })
      .where(and(eq(userTable.id, userId), eq(userTable.welcomeEmailSent, false)))
      .returning({ id: userTable.id })

    if (!updated) {
      // Another concurrent login already sent the email
      console.log(`[WelcomeEmail] Skipped (already sent) - User: ${userName}, Email: ${userEmail}`)
      return
    }

    // Send welcome email using the backend email service directly
    try {
      const { sendWelcomeEmail } = await import('../services/email/email.service')
      const portalUrl = getFrontendUrl()

      sendWelcomeEmail(userEmail, {
        userEmail,
        recipientName: userName,
        recipientEmail: userEmail,
        loginUrl: `${portalUrl}/sign-in`,
        companyName: process.env.COMPANY_NAME || 'Support Hero',
        portalUrl,
      })
      console.log(`[WelcomeEmail] Queued - User: ${userName}, Email: ${userEmail}`)
    } catch (innerErr) {
      console.error(`[WelcomeEmail] Send failed - User: ${userName}, Email: ${userEmail}, Reason:`, innerErr instanceof Error ? innerErr.message : innerErr)
    }
  } catch (err) {
    console.error(`[WelcomeEmail] Error - User: ${userName}, Email: ${userEmail}, Reason:`, err instanceof Error ? err.message : err)
  }
}