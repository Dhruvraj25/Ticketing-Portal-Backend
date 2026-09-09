import { Router } from "express";
import { sendImmediately } from "../services/email/email.queue";
import { welcomeTemplate } from "../services/email/templates/welcome";
import { getBranding } from "../services/email/templates/base.template";
import { buildFromAddress, loadSenderConfig } from "../services/email/email.transporter";
import { getFrontendUrl } from "../utils/frontend-url";

// DEV-ONLY route. This is a manual email-testing utility — it is NOT part of
// the notification pipeline and must never be reachable in production.
// Business events never call EmailService directly; backend-originated events
// go through the unified Notification Dispatcher
// (src/lib/notification-dispatcher.ts) and frontend-originated events come
// through this backend bridge (routes/email-notification.ts).
//
// Root-cause fix: this route previously called sendWelcomeEmail(..., {
// immediate: true }) without awaiting a real result — EmailService.send()'s
// immediate path is intentionally fire-and-forget (sendImmediately(params)
// .catch(...), returns the literal string 'immediate' synchronously; see
// email.service.ts), which is correct for production business events that
// must never block on email delivery, but made this DEV diagnostic route
// always report "queued successfully" whether or not the send actually
// reached the provider. This route now calls sendImmediately() directly
// (the same underlying transport call, still going through the real
// configured provider — Microsoft Graph) and AWAITS its real result, so a
// provider failure here is genuinely caught and reported, never masked.

const router = Router();

router.post("/test-email", async (req, res) => {
  // Hard gate: reject in production so the debug route can never send mail
  // from a live environment or leak email transport behaviour.
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }
  const portalUrl = getFrontendUrl();
  try {
    const branding = getBranding();
    const html = welcomeTemplate(
      {
        recipientName: "Infinixotech",
        recipientEmail: "support@infinixotech.com",
        companyName: "Infinixotech",
        portalUrl: `${portalUrl}/login`,
        loginUrl: `${portalUrl}/login`,
        userEmail: "support@infinixotech.com",
      },
      branding,
    );
    const senderConfig = loadSenderConfig();

    const result = await sendImmediately({
      from: buildFromAddress(senderConfig),
      to: "support@infinixotech.com",
      subject: `Welcome to ${branding.companyName}!`,
      html,
      eventType: "welcome",
    });

    if (!result.success) {
      return res.status(502).json({
        success: false,
        message: "Provider rejected the test email",
        error: result.error,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Test email accepted by the configured provider",
      messageId: result.messageId,
    });
  } catch (error) {
    console.error("Test email failed:", error instanceof Error ? error.message : error);

    return res.status(500).json({
      success: false,
      message: "Failed to send test email",
    });
  }
});

export default router;