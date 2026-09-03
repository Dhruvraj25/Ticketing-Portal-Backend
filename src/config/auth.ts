import { betterAuth } from 'better-auth'
import { pool } from './db'
import { db } from './db'
import { user as userTable } from '../models/schema'
import { and, eq } from 'drizzle-orm'
import { getFrontendUrl } from '../utils/frontend-url'
import { normalizeEmail } from '../utils/email'

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