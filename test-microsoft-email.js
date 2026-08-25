require("dotenv").config();

const { ClientSecretCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");

const tenantId = process.env.MICROSOFT_TENANT_ID;
const clientId = process.env.MICROSOFT_CLIENT_ID;
const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
const senderEmail = process.env.MICROSOFT_SENDER_EMAIL;

if (!tenantId || !clientId || !clientSecret || !senderEmail) {
  console.error("Missing Microsoft email environment variables.");
  process.exit(1);
}

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
        throw new Error("Failed to acquire Microsoft Graph access token.");
      }

      return token.token;
    },
  },
});

async function sendTestEmail() {
  try {
    console.log("Authenticating with Microsoft Entra ID...");

    const message = {
      message: {
        subject: "SupportHub Microsoft Graph Test",
        body: {
          contentType: "HTML",
          content: `
            <h2>SupportHub Email Test</h2>
            <p>This is a test email sent through Microsoft Graph.</p>
            <p>If you received this email, Microsoft 365 email integration is working.</p>
          `,
        },
        toRecipients: [
          {
            emailAddress: {
              address: "YOUR_TEST_EMAIL@example.com",
            },
          },
        ],
      },
      saveToSentItems: true,
    };

    console.log(`Sending from ${senderEmail}...`);

    await graphClient
      .api(`/users/${senderEmail}/sendMail`)
      .post(message);

    console.log("SUCCESS: Email sent through Microsoft Graph.");
  } catch (error) {
    console.error("FAILED: Microsoft Graph email test.");

    console.error("Message:", error.message);

    if (error.statusCode) {
      console.error("Status:", error.statusCode);
    }

    if (error.body) {
      console.error("Response:", error.body);
    }

    process.exit(1);
  }
}

sendTestEmail();