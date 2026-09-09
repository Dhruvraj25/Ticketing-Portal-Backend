import "isomorphic-fetch";
import { Client } from "@microsoft/microsoft-graph-client";
import type { EmailProvider } from "../email.types";
import { ClientSecretCredential } from "@azure/identity";

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

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

function getGraphConfig(): {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderEmail: string;
} {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const senderEmail = process.env.MICROSOFT_SENDER_EMAIL;

  const missing: string[] = [];
  if (!tenantId) missing.push("MICROSOFT_TENANT_ID");
  if (!clientId) missing.push("MICROSOFT_CLIENT_ID");
  if (!clientSecret) missing.push("MICROSOFT_CLIENT_SECRET");
  if (!senderEmail) missing.push("MICROSOFT_SENDER_EMAIL");

  if (missing.length > 0) {
    throw new Error(
      "[Email][Microsoft Graph] Missing required environment variables: " + missing.join(", "),
    );
  }

  return {
    tenantId: tenantId as string,
    clientId: clientId as string,
    clientSecret: clientSecret as string,
    senderEmail: senderEmail as string,
  };
}

let credential: ClientSecretCredential | null = null;
let graphClient: Client | null = null;
let senderEmail: string | null = null;

/** Create (once) and return the credential + Graph client for the configured app. */
function getGraphClient(): Client {
  if (graphClient) return graphClient;

  const config = getGraphConfig();
  senderEmail = config.senderEmail;

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

export async function sendMicrosoftGraphEmail(params: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}) {
  const recipients = Array.isArray(params.to)
    ? params.to
    : [params.to];

  try {
    const client = getGraphClient();
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
    };
  } catch (error) {
    // Surface the REAL Graph error (never swallow it) so a failed send is
    // never mistaken for success by the queue/caller.
    const err = error as { statusCode?: number; code?: string; message?: string };
    console.error(
      `[Email][Microsoft Graph] sendMail REJECTED by Graph for ${recipients.join(', ')} — ` +
      `status: ${err?.statusCode ?? 'unknown'}, code: ${err?.code ?? 'unknown'}, message: ${err?.message ?? String(error)}`,
    );
    throw error;
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