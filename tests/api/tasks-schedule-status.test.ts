import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { POST as createProject } from "@/app/api/projects/route";
import { POST as createTask, GET as listTasks } from "@/app/api/projects/[id]/tasks/route";
import { PATCH as patchTask } from "@/app/api/projects/[id]/tasks/[taskId]/route";
import { POST as createDependency } from "@/app/api/projects/[id]/tasks/dependencies/route";
import { workEndDate, addDays, isoDate } from "@/lib/dateUtils";
import { nextWorkingDay } from "@/lib/scheduleDefaults";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

function makeRequest(url: string, method: string, body?: unknown, origin = "http://localhost:3000") {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json", origin },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function makeOnboardedUserAndProject(email: string, projectName: string) {
  const company = await prisma.company.create({ data: { name: "Acme inc" } });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword("longenough"),
      firstName: "Ada",
      lastName: "Lovelace",
      department: "Engineering",
      position: "Engineer",
      companyId: company.id,
      onboardingComplete: true,
    },
  });
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, companyId: user.companyId } } as never);
  const projectRes = await createProject(
    makeRequest("http://localhost:3000/api/projects", "POST", { name: projectName })
  );
  const project = await projectRes.json();
  return { user, project };
}

async function makeEpic(projectId: string, name = "Epic") {
  const url = `http://localhost:3000/api/projects/${projectId}/tasks`;
  const res = await createTask(makeRequest(url, "POST", { name, kind: "category" }), {
    params: { id: projectId },
  });
  return (await res.json()).task;
}

describe("scheduleStatus — task creation", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("a name-only create gets default estimated dates (never null)", async () => {
    const { project } = await makeOnboardedUserAndProject("ghost-create@acme-corp.com", "G1");
    const epic = await makeEpic(project.id);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;

    const res = await createTask(makeRequest(url, "POST", { name: "Just a name", parentId: epic.id }), {
      params: { id: project.id },
    });
    expect(res.status).toBe(201);
    const task = (await res.json()).task;
    expect(task.scheduleStatus).toBe("estimated");
    expect(task.startDate).not.toBeNull();
    expect(task.durationDays).toBe(1);
    // No plan baseline until the dates are confirmed.
    expect(task.originalEndDate).toBeNull();
    expect(task.originalDurationDays).toBe(0);
  });

  it("sequential name-only creates cascade: each starts after the previous ends", async () => {
    const { project } = await makeOnboardedUserAndProject("ghost-cascade@acme-corp.com", "G2");
    const epic = await makeEpic(project.id);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;

    const aRes = await createTask(makeRequest(url, "POST", { name: "A", parentId: epic.id }), {
      params: { id: project.id },
    });
    const a = (await aRes.json()).task;
    const bRes = await createTask(makeRequest(url, "POST", { name: "B", parentId: epic.id }), {
      params: { id: project.id },
    });
    const b = (await bRes.json()).task;

    const aEnd = workEndDate(new Date(a.startDate), a.durationDays);
    expect(isoDate(new Date(b.startDate))).toBe(isoDate(nextWorkingDay(addDays(aEnd, 1))));
  });

  it("explicit dates → confirmed, with a plan baseline", async () => {
    const { project } = await makeOnboardedUserAndProject("confirmed-create@acme-corp.com", "G3");
    const epic = await makeEpic(project.id);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;

    const start = "2026-08-03T00:00:00.000Z"; // Monday
    const res = await createTask(
      makeRequest(url, "POST", { name: "Planned", parentId: epic.id, startDate: start, durationDays: 3 }),
      { params: { id: project.id } }
    );
    const task = (await res.json()).task;
    expect(task.scheduleStatus).toBe("confirmed");
    expect(isoDate(new Date(task.originalEndDate))).toBe(
      isoDate(workEndDate(new Date(start), 3))
    );
    expect(task.originalDurationDays).toBe(3);
  });

  it("scheduleStatus 'unscheduled' → no dates, parked in the backlog", async () => {
    const { project } = await makeOnboardedUserAndProject("backlog-create@acme-corp.com", "G4");
    const epic = await makeEpic(project.id);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;

    const res = await createTask(
      makeRequest(url, "POST", { name: "Someday", parentId: epic.id, scheduleStatus: "unscheduled" }),
      { params: { id: project.id } }
    );
    const task = (await res.json()).task;
    expect(task.scheduleStatus).toBe("unscheduled");
    expect(task.startDate).toBeNull();
    expect(task.durationDays).toBe(0);
  });

  it("GET round-trips scheduleStatus", async () => {
    const { project } = await makeOnboardedUserAndProject("ghost-get@acme-corp.com", "G5");
    const epic = await makeEpic(project.id);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    await createTask(makeRequest(url, "POST", { name: "T", parentId: epic.id }), {
      params: { id: project.id },
    });

    const listRes = await listTasks({} as never, { params: { id: project.id } });
    const list = await listRes.json();
    const task = list.tasks.find((t: { kind: string }) => t.kind === "task");
    expect(task.scheduleStatus).toBe("estimated");
  });
});

describe("scheduleStatus — confirmation and backlog transitions", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  async function makeEstimatedTask(projectId: string) {
    const epic = await makeEpic(projectId);
    const url = `http://localhost:3000/api/projects/${projectId}/tasks`;
    const res = await createTask(makeRequest(url, "POST", { name: "Ghost", parentId: epic.id }), {
      params: { id: projectId },
    });
    return { epic, task: (await res.json()).task };
  }

  it("a drag on a ghost confirms it — no delay dialog, no reason required", async () => {
    const { project } = await makeOnboardedUserAndProject("ghost-drag@acme-corp.com", "C1");
    const { task } = await makeEstimatedTask(project.id);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks/${task.id}`;

    const start = "2026-08-10T00:00:00.000Z"; // Monday
    const res = await patchTask(
      makeRequest(url, "PATCH", { startDate: start, durationDays: 2, scheduleStatus: "confirmed" }),
      { params: { id: project.id, taskId: task.id } }
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()).task;
    expect(updated.scheduleStatus).toBe("confirmed");
    // The confirmed dates become the plan baseline.
    expect(isoDate(new Date(updated.originalEndDate))).toBe(
      isoDate(workEndDate(new Date(start), 2))
    );
    expect(updated.originalDurationDays).toBe(2);
  });

  it("date changes on an estimated task auto-confirm even without scheduleStatus", async () => {
    const { project } = await makeOnboardedUserAndProject("ghost-auto@acme-corp.com", "C2");
    const { task } = await makeEstimatedTask(project.id);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks/${task.id}`;

    const res = await patchTask(
      makeRequest(url, "PATCH", { startDate: "2026-08-11T00:00:00.000Z", durationDays: 1 }),
      { params: { id: project.id, taskId: task.id } }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).task.scheduleStatus).toBe("confirmed");
  });

  it("renaming an estimated task does NOT confirm it", async () => {
    const { project } = await makeOnboardedUserAndProject("ghost-rename@acme-corp.com", "C3");
    const { task } = await makeEstimatedTask(project.id);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks/${task.id}`;

    const res = await patchTask(makeRequest(url, "PATCH", { name: "Renamed" }), {
      params: { id: project.id, taskId: task.id },
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()).task;
    expect(updated.scheduleStatus).toBe("estimated");
    expect(updated.startDate).not.toBeNull();
  });

  it("moving to the backlog clears dates, the baseline, and dependencies", async () => {
    const { project } = await makeOnboardedUserAndProject("backlog-move@acme-corp.com", "C4");
    const epic = await makeEpic(project.id);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    const aRes = await createTask(
      makeRequest(url, "POST", { name: "A", parentId: epic.id, startDate: "2026-08-03T00:00:00.000Z", durationDays: 2 }),
      { params: { id: project.id } }
    );
    const a = (await aRes.json()).task;
    const bRes = await createTask(
      makeRequest(url, "POST", { name: "B", parentId: epic.id, startDate: "2026-08-05T00:00:00.000Z", durationDays: 2 }),
      { params: { id: project.id } }
    );
    const b = (await bRes.json()).task;
    await createDependency(
      makeRequest(`${url}/dependencies`, "POST", { predecessorId: a.id, successorId: b.id }),
      { params: { id: project.id } }
    );

    const res = await patchTask(
      makeRequest(`${url}/${b.id}`, "PATCH", { scheduleStatus: "unscheduled" }),
      { params: { id: project.id, taskId: b.id } }
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()).task;
    expect(updated.scheduleStatus).toBe("unscheduled");
    expect(updated.startDate).toBeNull();
    expect(updated.durationDays).toBe(0);
    expect(updated.originalEndDate).toBeNull();

    const deps = await prisma.taskDependency.findMany({
      where: { OR: [{ predecessorId: b.id }, { successorId: b.id }] },
    });
    expect(deps).toHaveLength(0);
  });

  it("scheduling out of the backlog needs no reason and sets a fresh baseline", async () => {
    const { project } = await makeOnboardedUserAndProject("backlog-out@acme-corp.com", "C5");
    const epic = await makeEpic(project.id);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    const createRes = await createTask(
      makeRequest(url, "POST", { name: "Parked", parentId: epic.id, scheduleStatus: "unscheduled" }),
      { params: { id: project.id } }
    );
    const parked = (await createRes.json()).task;

    const start = "2026-08-17T00:00:00.000Z"; // Monday
    const res = await patchTask(
      makeRequest(`${url}/${parked.id}`, "PATCH", { startDate: start, durationDays: 1 }),
      { params: { id: project.id, taskId: parked.id } }
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()).task;
    expect(updated.scheduleStatus).toBe("confirmed");
    expect(isoDate(new Date(updated.originalEndDate))).toBe(isoDate(new Date(start)));
  });

  it("undo back to estimated drops the baseline and needs no reason", async () => {
    const { project } = await makeOnboardedUserAndProject("ghost-undo@acme-corp.com", "C6");
    const { task } = await makeEstimatedTask(project.id);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks/${task.id}`;

    // Confirm by drag…
    await patchTask(
      makeRequest(url, "PATCH", { startDate: "2026-08-10T00:00:00.000Z", durationDays: 2, scheduleStatus: "confirmed" }),
      { params: { id: project.id, taskId: task.id } }
    );
    // …then undo back to the original estimated schedule.
    const res = await patchTask(
      makeRequest(url, "PATCH", { startDate: task.startDate, durationDays: task.durationDays, scheduleStatus: "estimated" }),
      { params: { id: project.id, taskId: task.id } }
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()).task;
    expect(updated.scheduleStatus).toBe("estimated");
    expect(updated.originalEndDate).toBeNull();
    expect(updated.originalDurationDays).toBe(0);
  });

  it("the delay guard still protects confirmed tasks", async () => {
    const { project } = await makeOnboardedUserAndProject("guard-intact@acme-corp.com", "C7");
    const epic = await makeEpic(project.id);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    const createRes = await createTask(
      makeRequest(url, "POST", { name: "Planned", parentId: epic.id, startDate: "2026-08-03T00:00:00.000Z", durationDays: 2 }),
      { params: { id: project.id } }
    );
    const task = (await createRes.json()).task;

    // Pushing a confirmed task's end past its baseline still 409s.
    const res = await patchTask(
      makeRequest(`${url}/${task.id}`, "PATCH", { startDate: "2026-08-10T00:00:00.000Z", durationDays: 2 }),
      { params: { id: project.id, taskId: task.id } }
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("SCHEDULE_DELAY_REQUIRES_CONFIRMATION");
  });
});
