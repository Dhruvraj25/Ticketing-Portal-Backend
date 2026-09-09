import "isomorphic-fetch";
import { Client } from "@microsoft/microsoft-graph-client";
import type { EmailProvider } from "../email.types";
import { ClientSecretCredential } from "@azure/identity";

const tenantId = process.env.MICROSOFT_TENANT_ID!;
const clientId = process.env.MICROSOFT_CLIENT_ID!;
const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!;
const senderEmail = process.env.MICROSOFT_SENDER_EMAIL!;

const credential = new ClientSecretCredential(
  tenantId,
  clientId,
  clientSecret
);

const graphClient = Client.initWithMiddleware({
  authProvider: {
    getAccessToken: async () => {
      const token = await credential.getToken(
        "https://graph.microsoft.com/.default"
      );

      if (!token?.token) {
        throw new Error("Failed to acquire Microsoft Graph access token");
      }

      return token.token;
    },
  },
});

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
      // Microsoft Graph's /sendMail endpoint returns HTTP 202 Accepted with
      // an EMPTY response body by design — there is no message resource, and
      // therefore no real Graph message ID to capture here. A resolved
      // promise means Graph ACCEPTED the request for delivery; it does not
      // by itself prove the message reached the recipient's mailbox (that
      // happens asynchronously inside Microsoft 365, outside this API call).
      await graphClient
          .api(`/users/${senderEmail}/sendMail`)
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
        `[Email][Microsoft Graph] Accepted by Graph (HTTP 202) for ${recipients.join(', ')} — subject: ${params.subject}`
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
        `status: ${err?.statusCode ?? 'unknown'}, code: ${err?.code ?? 'unknown'}, message: ${err?.message ?? String(error)}`
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
      const token = await credential.getToken(
        "https://graph.microsoft.com/.default"
      );

      return !!token?.token;
    } catch (error) {
      console.error(
        "[Email][Microsoft Graph] Authentication failed:",
        error instanceof Error ? error.message : error
      );

      return false;
    }
  },
};