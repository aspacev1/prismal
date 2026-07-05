import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInviteEmail(
  to: string,
  projectName: string,
  inviterName: string,
  inviteUrl: string
): Promise<void> {
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "flowline <onboarding@resend.dev>",
    to,
    subject: `${inviterName} invited you to ${projectName} on flowline`,
    html: `<p>${inviterName} invited you to join <strong>${projectName}</strong> on flowline.</p><p><a href="${inviteUrl}">Accept invite</a></p>`,
  });
}
