import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn().mockResolvedValue({ data: { id: "test" }, error: null });

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function Resend() {
    return { emails: { send: sendMock } };
  }),
}));

describe("sendInviteEmail", () => {
  beforeEach(() => {
    sendMock.mockClear();
  });

  it("sends an email with the invite link, project name, and inviter name", async () => {
    const { sendInviteEmail } = await import("@/lib/email");
    await sendInviteEmail("teammate@acme-corp.com", "Website relaunch", "Grace Hopper", "https://flowline.app/invite/abc123");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe("teammate@acme-corp.com");
    expect(call.subject).toContain("Website relaunch");
    expect(call.html).toContain("https://flowline.app/invite/abc123");
    expect(call.html).toContain("Grace Hopper");
  });
});
