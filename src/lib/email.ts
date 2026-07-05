import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "flowline <onboarding@resend.dev>",
    to,
    subject: `${inviterName} invited you to ${projectName} on flowline`,
    html: `<p>${safeInviterName} invited you to join <strong>${safeProjectName}</strong> on flowline.</p><p><a href="${inviteUrl}">Accept invite</a></p>`,
  });
}
