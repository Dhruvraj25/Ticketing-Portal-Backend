import { Request, Response } from "express";
import { sendWelcomeEmail } from "../services/email/email.service";
import { getFrontendUrl } from "../utils/frontend-url";

export async function sendTestEmail(req: Request, res: Response) {
  try {
    const portalUrl = getFrontendUrl();

    sendWelcomeEmail(
      "support@infinixotech.com",
      {
        recipientName: "Infinixotech",
        recipientEmail: "support@infinixotech.com",
        companyName: "Infinixotech",
        portalUrl: `${portalUrl}/login`,

        userEmail: "support@infinixotech.com",
        loginUrl: `${portalUrl}/login`,
      },
      {
        immediate: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Test email queued successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to send email",
    });
  }
}