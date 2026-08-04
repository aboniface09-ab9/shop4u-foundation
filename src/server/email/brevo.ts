/**
 * Brevo transactional email — server-only.
 *
 * Confirmed against Brevo's live API docs 2026-07-25: POST
 * https://api.brevo.com/v3/smtp/email, auth via a plain `api-key` header
 * (not Bearer), JSON body {sender, to, subject, htmlContent}, 201 on
 * success with {messageId}.
 *
 * SERVER-ONLY. Never import from src/lib or src/routes (browser code) —
 * the API key must never reach a browser bundle.
 */

export type BrevoEmailEnv = {
  BREVO_API_KEY?: string;
  /** Must be a sender address verified in your Brevo account, or sends
   *  will fail — see Brevo dashboard → Senders, Domains & Dedicated IPs. */
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
};

export type SendTransactionalEmailInput = {
  to: { email: string; name?: string };
  subject: string;
  htmlContent: string;
};

export type SendTransactionalEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string };

export async function sendTransactionalEmail(
  env: BrevoEmailEnv,
  input: SendTransactionalEmailInput,
): Promise<SendTransactionalEmailResult> {
  if (!env.BREVO_API_KEY) {
    return { ok: false, reason: "BREVO_API_KEY not configured" };
  }
  if (!env.BREVO_SENDER_EMAIL) {
    return { ok: false, reason: "BREVO_SENDER_EMAIL not configured" };
  }

  let response: Response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME ?? "YouCommerce" },
        to: [input.to],
        subject: input.subject,
        htmlContent: input.htmlContent,
      }),
    });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Network error" };
  }

  const raw = await response.json().catch(() => undefined);
  if (!response.ok) {
    return { ok: false, reason: `Brevo returned ${response.status}: ${JSON.stringify(raw)}` };
  }

  return { ok: true, messageId: (raw as { messageId?: string })?.messageId ?? "" };
}
