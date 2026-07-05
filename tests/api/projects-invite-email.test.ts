import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { sendInviteEmail } from "@/lib/email";
import { POST } from "@/app/api/projects/[id]/invite-email/route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

async function createOnboardedUser(email: string) {
  const company = await prisma.company.create({ data: { name: "Acme inc" } });
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword("longenough"),
      firstName: "Grace",
      lastName: "Hopper",
      department: "Engineering",
      position: "Engineer",
      companyId: company.id,
      onboardingComplete: true,
    },
  });
}

function makeRequest(id: string, body: unknown, origin = "http://localhost:3000") {
  return new NextRequest(`http://localhost:3000/api/projects/${id}/invite-email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("POST /api/projects/[id]/invite-email", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
    vi.mocked(sendInviteEmail).mockClear();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const response = await POST(makeRequest("anything", { emails: ["a@b.com"] }), { params: { id: "anything" } });
    expect(response.status).toBe(401);
  });

  it("rejects an invalid email in the list", async () => {
    const owner = await createOnboardedUser("owner@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "Website relaunch", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    vi.mocked(auth).mockResolvedValue({ user: { id: owner.id } } as never);

    const response = await POST(makeRequest(project.id, { emails: ["not-an-email"] }), { params: { id: project.id } });
    expect(response.status).toBe(400);
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it("sends one email per valid address, including free-email-provider addresses", async () => {
    const owner = await createOnboardedUser("owner2@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "Website relaunch", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    vi.mocked(auth).mockResolvedValue({ user: { id: owner.id } } as never);

    const response = await POST(
      makeRequest(project.id, { emails: ["teammate@gmail.com", "other@acme-corp.com"] }),
      { params: { id: project.id } }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sent).toBe(2);
    expect(sendInviteEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendInviteEmail).mock.calls[0][0]).toBe("teammate@gmail.com");
    expect(vi.mocked(sendInviteEmail).mock.calls[0][1]).toBe("Website relaunch");
    expect(vi.mocked(sendInviteEmail).mock.calls[0][2]).toBe("Grace Hopper");
  });

  it("rejects a non-member", async () => {
    const owner = await createOnboardedUser("owner3@acme-corp.com");
    const outsider = await createOnboardedUser("outsider@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    vi.mocked(auth).mockResolvedValue({ user: { id: outsider.id } } as never);

    const response = await POST(makeRequest(project.id, { emails: ["a@b.com"] }), { params: { id: project.id } });
    expect(response.status).toBe(403);
  });
});
