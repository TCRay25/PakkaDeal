import { config } from "../config.js";

/**
 * Sends a real SMS via configured SMS Gateway (Greenweb, BulkSMSBD, Twilio, or Custom Gateway),
 * or logs to console if no gateway credentials are configured yet.
 */
export async function sendSms(phone, message) {
  const cleanPhone = (phone || "").replace(/\D/g, "");

  // 1. Greenweb SMS Gateway (Popular BD SMS Gateway)
  if (process.env.GREENWEB_TOKEN) {
    try {
      const url = `https://api.greenweb.com.bd/api.php?token=${encodeURIComponent(
        process.env.GREENWEB_TOKEN
      )}&to=${encodeURIComponent(cleanPhone)}&message=${encodeURIComponent(message)}`;
      const res = await fetch(url);
      const text = await res.text();
      console.log(`[GREENWEB SMS RESPONSE] To: ${cleanPhone} | Status:`, text);
      return { success: true, provider: "greenweb", response: text };
    } catch (err) {
      console.error("[GREENWEB SMS ERROR]", err.message);
    }
  }

  // 2. BulkSMS BD Gateway
  if (process.env.BULKSMSBD_API_KEY && process.env.BULKSMSBD_SENDER_ID) {
    try {
      const url = "http://bulksmsbd.net/api/smsapi";
      const body = new URLSearchParams({
        api_key: process.env.BULKSMSBD_API_KEY,
        type: "text",
        number: cleanPhone,
        senderid: process.env.BULKSMSBD_SENDER_ID,
        message: message,
      });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await res.json().catch(() => ({}));
      console.log(`[BULKSMSBD RESPONSE] To: ${cleanPhone} | Status:`, data);
      return { success: true, provider: "bulksmsbd", response: data };
    } catch (err) {
      console.error("[BULKSMSBD ERROR]", err.message);
    }
  }

  // 3. Twilio SMS Gateway
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    try {
      const e164Phone = cleanPhone.startsWith("88") ? `+${cleanPhone}` : `+88${cleanPhone}`;
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
      const url = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
      const body = new URLSearchParams({
        To: e164Phone,
        From: process.env.TWILIO_PHONE_NUMBER,
        Body: message,
      });
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      const data = await res.json().catch(() => ({}));
      console.log(`[TWILIO RESPONSE] To: ${e164Phone} | Status:`, data?.status || data);
      return { success: true, provider: "twilio", response: data };
    } catch (err) {
      console.error("[TWILIO ERROR]", err.message);
    }
  }

  // 4. Custom SMS Gateway Webhook
  if (process.env.SMS_GATEWAY_URL) {
    try {
      const res = await fetch(process.env.SMS_GATEWAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, message }),
      });
      const text = await res.text();
      console.log(`[CUSTOM SMS GATEWAY RESPONSE] To: ${cleanPhone} |`, text);
      return { success: true, provider: "custom", response: text };
    } catch (err) {
      console.error("[CUSTOM SMS GATEWAY ERROR]", err.message);
    }
  }

  // Fallback: No SMS Gateway configured in .env yet
  console.log(
    `[SMS NOT SENT TO PHYSICAL PHONE: NO GATEWAY CONFIGURED]\n` +
    `To send real SMS to SIM, add GREENWEB_TOKEN, BULKSMSBD_API_KEY, or TWILIO credentials in backend/.env.\n` +
    `Logged message for ${cleanPhone}: "${message}"`
  );
  return { success: false, reason: "no_gateway_configured" };
}
