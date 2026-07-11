import { Resend } from "resend";

// Instantiated lazily, not at module scope: the Resend constructor throws when
// the API key is absent, and Next.js imports this module while collecting page
// data at build time — where RESEND_API_KEY is typically not set. A missing
// key must fail the send at runtime with a clear error, not the build.
let resendClient: Resend | null = null;

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !apiKey.startsWith("re_")) {
    throw new Error(
      "RESEND_API_KEY is missing or does not look like a real Resend key (should start with 're_')."
    );
  }
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

// inviterName/projectName come from user-controlled data (onboarding name,
// project title) and land in an HTML email body — escape before interpolating.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendInviteEmail(
  to: string,
  projectName: string,
  inviterName: string,
  inviteUrl: string
): Promise<void> {
  const safeProjectName = escapeHtml(projectName);
  const safeInviterName = escapeHtml(inviterName);

  // The Resend SDK resolves with { data, error } — a rejected-style failure
  // can come back as a resolved promise with `error` set, so we inspect both.
  const { error } = await getResend().emails.send({
    from: process.env.EMAIL_FROM ?? "flowline <onboarding@resend.dev>",
    to,
    subject: `${inviterName} invited you to ${projectName} on flowline`,
    html: `<p>${safeInviterName} invited you to join <strong>${safeProjectName}</strong> on flowline.</p><p><a href="${inviteUrl}">Accept invite</a></p>`,
  });

  if (error) {
    console.error(`[email] Resend rejected send to ${to}:`, error);
    throw new Error(`Resend error: ${error.message ?? "Unknown error"}`);
  }
}