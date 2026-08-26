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

  return {
    success: true,
    messageId: "graph-api-sent",
  };
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