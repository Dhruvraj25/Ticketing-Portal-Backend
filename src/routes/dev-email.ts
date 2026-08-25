import { Router } from "express";
import { sendWelcomeEmail } from "../services/email/email.service";

// DEV-ONLY route. This is a manual email-testing utility — it is NOT part of
// the notification pipeline and must never be reachable in production.
// Business events never call EmailService directly; they go through the
// unified Notification Dispatcher (Frontend lib/notify-all.ts → this backend
// bridge). See docs/NOTIFICATION_REFACTOR_REPORT.md.

const router = Router();

router.post("/test-email", async (req, res) => {
  // Hard gate: reject in production so the debug route can never send mail
  // from a live environment or leak email transport behaviour.
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  try {
    sendWelcomeEmail(
      "support@infinixotech.com",
      {
        recipientName: "Infinixotech",
        recipientEmail: "support@infinixotech.com",
        companyName: "Infinixotech",
        portalUrl: "http://localhost:3000/login",

        userEmail: "support@infinixotech.com",
        loginUrl: "http://localhost:3000/login",
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
    console.error("Test email failed:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send test email",
    });
  }
});

export default router;