import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey || !apiKey.startsWith("re_")) {
  console.error(
    "[email] RESEND_API_KEY is missing or does not look like a real Resend key (should start with 're_'). Invite emails will fail."
  );
}

const resend = new Resend(apiKey);

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
  const { error } = await resend.emails.send({
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