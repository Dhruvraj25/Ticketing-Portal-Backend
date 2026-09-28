import "isomorphic-fetch";
import { Client } from "@microsoft/microsoft-graph-client";
import type { EmailProvider } from "../email.types";
import { ClientSecretCredential } from "@azure/identity";
import { resolveSender, type ResolvedSender } from "../email-sender-config";
import { getGraphErrorMessage } from "../email.constants";

// ─── Configuration (lazy) ─────────────────────────────────────────────────
// ROOT-CAUSE FIX: the credential and Graph client were constructed at MODULE
// LOAD time from process.env. Because email.provider.ts eagerly imports this
// module (via the provider registry), ANY missing MICROSOFT_* variable crashed
// the whole backend on boot with
//   CredentialUnavailableError: ClientSecretCredential: tenantId is a required
//   parameter.
// — even when EMAIL_PROVIDER was console/resend/microsoft-smtp. Now the
// configuration is validated lazily, only when this provider is actually
// selected and used, and the error names the missing variables.
//
// The SENDER is not part of the credential config: it is resolved per send by
// resolveSender() (Admin → Email Management verified sender, else
// MICROSOFT_SENDER_EMAIL), so an admin can change it without a restart.

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

function getGraphConfig(): {
  tenantId: string;
  clientId: string;
  clientSecret: string;
} {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  const missing: string[] = [];
  if (!tenantId) missing.push("MICROSOFT_TENANT_ID");
  if (!clientId) missing.push("MICROSOFT_CLIENT_ID");
  if (!clientSecret) missing.push("MICROSOFT_CLIENT_SECRET");

  if (missing.length > 0) {
    throw new Error(
      "[Email][Microsoft Graph] Missing required environment variables: " + missing.join(", "),
    );
  }

  return {
    tenantId: tenantId as string,
    clientId: clientId as string,
    clientSecret: clientSecret as string,
  };
}

/** True when every Graph credential variable is present (values never exposed). */
export function isGraphConfigured(): boolean {
  return Boolean(
    process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET,
  );
}

/** The environment (bootstrap) sender — MICROSOFT_SENDER_EMAIL. */
export function getEnvironmentSenderEmail(): string | null {
  return process.env.MICROSOFT_SENDER_EMAIL?.trim() || null;
}

let credential: ClientSecretCredential | null = null;
let graphClient: Client | null = null;

/** Create (once) and return the credential + Graph client for the configured app. */
function getGraphClient(): Client {
  if (graphClient) return graphClient;

  const config = getGraphConfig();

  credential = new ClientSecretCredential(
    config.tenantId,
    config.clientId,
    config.clientSecret,
  );

  graphClient = Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential!.getToken(GRAPH_SCOPE);

        if (!token?.token) {
          throw new Error("Failed to acquire Microsoft Graph access token");
        }

        return token.token;
      },
    },
  });

  return graphClient;
}

export async function sendMicrosoftGraphEmail(
  params: {
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
  },
  options?: { sender?: ResolvedSender },
) {
  const recipients = Array.isArray(params.to)
    ? params.to
    : [params.to];

  try {
    const client = getGraphClient();
    const sender = options?.sender ?? (await resolveSender());
    const senderEmail = sender.email;
    if (!senderEmail) {
      throw new Error("No sender email is configured (set it in Admin → Email Management or MICROSOFT_SENDER_EMAIL)");
    }
    const from = senderEmail!;

    // Microsoft Graph's /sendMail endpoint returns HTTP 202 Accepted with
    // an EMPTY response body by design — there is no message resource, and
    // therefore no real Graph message ID to capture here. A resolved
    // promise means Graph ACCEPTED the request for delivery; it does not
    // by itself prove the message reached the recipient's mailbox (that
    // happens asynchronously inside Microsoft 365, outside this API call).
    await client
      .api(`/users/${from}/sendMail`)
      .post({
        message: {
          subject: params.subject,
          body: {
            contentType: params.html ? "HTML" : "Text",
            content: params.html || params.text || "",
          },
          // Display name for the sending mailbox (address is the mailbox itself).
          ...(sender.name ? { from: { emailAddress: { address: from, name: sender.name } } } : {}),
          toRecipients: recipients.map((email) => ({
            emailAddress: {
              address: email,
            },
          })),
        },
        saveToSentItems: true,
      });

    console.log(
      `[Email][Microsoft Graph] Accepted by Graph (HTTP 202) for ${recipients.join(', ')} — subject: ${params.subject}`,
    );

    return {
      success: true,
      // Not a real Microsoft Graph message identifier — sendMail returns no
      // body to derive one from. This only records that Graph accepted the
      // request, distinct from confirmed mailbox delivery (see comment above).
      messageId: "graph-accepted-no-id-returned",
      from,
    };
  } catch (error) {
    const err = error as { statusCode?: number; code?: string; message?: string };
    const status = err?.statusCode ?? 'unknown';
    const code = err?.code ?? 'unknown';
    const message = err?.message ?? String(error);

    console.error(
      `[Email][Microsoft Graph] sendMail REJECTED by Graph for ${recipients.join(', ')} — ` +
      `status: ${status}, code: ${code}, message: ${message}`,
    );

    // Throw a structured error with status code so callers can map
    // to user-friendly messages without exposing Graph internals.
    const graphError = new Error(message) as Error & { statusCode: number; provider: string };
    graphError.statusCode = typeof status === 'number' ? status : 0;
    graphError.provider = 'microsoft-graph';
    throw graphError;
  }
}

export const microsoftGraphProvider: EmailProvider = {
  name: "microsoft-graph",

  async send(params) {
    return sendMicrosoftGraphEmail({
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
  },

  async verifyConnection() {
    try {
      getGraphClient();
      const token = await credential!.getToken(GRAPH_SCOPE);
      return !!token?.token;
    } catch (error) {
      console.error(
        "[Email][Microsoft Graph] Authentication failed:",
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  },
};

// ─── Admin checks (Email Management) ────────────────────────────────────────
// Both return only safe, user-facing messages — never tokens, secrets or raw
// Graph response bodies.

/** Can the app authenticate to Microsoft Graph right now? (token acquisition only) */
export async function checkGraphConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!isGraphConfigured()) {
    return { ok: false, error: 'Microsoft Graph credentials are not configured on the server.' };
  }
  const ok = await microsoftGraphProvider.verifyConnection();
  return ok ? { ok: true } : { ok: false, error: 'Unable to authenticate with Microsoft Graph. Check the app registration credentials.' };
}

/**
 * Verify that `email` is a mailbox this Graph app may send as, by sending a
 * verification message FROM that mailbox TO itself. The app only holds the
 * Mail.Send permission (no directory read), so a real send is the only
 * authoritative check. Nothing is persisted here — the caller decides.
 */
export async function verifyGraphSender(
  email: string,
  name: string | null,
  message: { subject: string; html: string },
): Promise<{ ok: true } | { ok: false; statusCode: number; error: string }> {
  try {
    await sendMicrosoftGraphEmail(
      { to: email, subject: message.subject, html: message.html },
      { sender: { email, name, source: 'database' } },
    );
    return { ok: true };
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode ?? 0;
    const reason =
      statusCode === 403 || statusCode === 401
        ? 'Microsoft Graph denied permission to send as this mailbox (the app is not authorized for it).'
        : statusCode === 404
          ? 'This mailbox was not found in the Microsoft 365 tenant.'
          : getGraphErrorMessage(statusCode);
    return { ok: false, statusCode, error: reason };
  }
}
