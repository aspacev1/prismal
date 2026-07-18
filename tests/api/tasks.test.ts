import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { POST as createProject } from "@/app/api/projects/route";
import { POST as createTask, GET as listTasks } from "@/app/api/projects/[id]/tasks/route";
import { PATCH as patchTask } from "@/app/api/projects/[id]/tasks/[taskId]/route";

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

describe("Task kind + 3-level cap", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("creates a category with kind: 'category' and round-trips it", async () => {
    const { project } = await makeOnboardedUserAndProject("kind-cat@acme-corp.com", "P1");
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    const res = await createTask(makeRequest(url, "POST", { name: "Phase 1", kind: "category" }), {
      params: { id: project.id },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.task.kind).toBe("category");

    const listRes = await listTasks({} as never, { params: { id: project.id } });
    const list = await listRes.json();
    expect(list.tasks[0].kind).toBe("category");
  });

  it("creates a task with default kind 'task' under an epic", async () => {
    const { project } = await makeOnboardedUserAndProject("kind-default@acme-corp.com", "P2");
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    const epicRes = await createTask(makeRequest(url, "POST", { name: "Epic", kind: "category" }), {
      params: { id: project.id },
    });
    const epic = (await epicRes.json()).task;

    const res = await createTask(makeRequest(url, "POST", { name: "Plain task", parentId: epic.id }), {
      params: { id: project.id },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.task.kind).toBe("task");
    expect(body.task.parentId).toBe(epic.id);
  });

  it("allows a task under a category (2nd level)", async () => {
    const { project } = await makeOnboardedUserAndProject("nest-ok@acme-corp.com", "P3");
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    const catRes = await createTask(makeRequest(url, "POST", { name: "Cat", kind: "category" }), {
      params: { id: project.id },
    });
    const cat = (await catRes.json()).task;

    const taskRes = await createTask(
      makeRequest(url, "POST", { name: "Task under cat", parentId: cat.id }),
      { params: { id: project.id } }
    );
    expect(taskRes.status).toBe(201);
  });

  it("allows a subtask under a task (3rd level)", async () => {
    const { project } = await makeOnboardedUserAndProject("nest-3@acme-corp.com", "P4");
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    const catRes = await createTask(makeRequest(url, "POST", { name: "Cat", kind: "category" }), {
      params: { id: project.id },
    });
    const cat = (await catRes.json()).task;
    const taskRes = await createTask(
      makeRequest(url, "POST", { name: "Task", parentId: cat.id }),
      { params: { id: project.id } }
    );
    const task = (await taskRes.json()).task;

    const subRes = await createTask(
      makeRequest(url, "POST", { name: "Sub", parentId: task.id }),
      { params: { id: project.id } }
    );
    expect(subRes.status).toBe(201);
  });

  it("rejects a 4th-level child under a subtask with 400", async () => {
    const { project } = await makeOnboardedUserAndProject("nest-4@acme-corp.com", "P5");
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    const catRes = await createTask(makeRequest(url, "POST", { name: "Cat", kind: "category" }), {
      params: { id: project.id },
    });
    const cat = (await catRes.json()).task;
    const taskRes = await createTask(
      makeRequest(url, "POST", { name: "Task", parentId: cat.id }),
      { params: { id: project.id } }
    );
    const task = (await taskRes.json()).task;
    const subRes = await createTask(
      makeRequest(url, "POST", { name: "Sub", parentId: task.id }),
      { params: { id: project.id } }
    );
    const sub = (await subRes.json()).task;

    const tooDeepRes = await createTask(
      makeRequest(url, "POST", { name: "Too deep", parentId: sub.id }),
      { params: { id: project.id } }
    );
    expect(tooDeepRes.status).toBe(400);
    const body = await tooDeepRes.json();
    expect(body.error).toMatch(/maximum nesting depth/i);
  });

  it("rejects a category with a parentId", async () => {
    const { project } = await makeOnboardedUserAndProject("cat-parent@acme-corp.com", "P6");
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    const catRes = await createTask(makeRequest(url, "POST", { name: "Cat", kind: "category" }), {
      params: { id: project.id },
    });
    const cat = (await catRes.json()).task;

    const badRes = await createTask(
      makeRequest(url, "POST", { name: "Nested cat", kind: "category", parentId: cat.id }),
      { params: { id: project.id } }
    );
    expect(badRes.status).toBe(400);
  });

  it("patches kind on an existing task", async () => {
    const { project } = await makeOnboardedUserAndProject("patch-kind@acme-corp.com", "P7");
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    const epicRes = await createTask(makeRequest(url, "POST", { name: "Epic", kind: "category" }), {
      params: { id: project.id },
    });
    const epic = (await epicRes.json()).task;

    const taskRes = await createTask(makeRequest(url, "POST", { name: "T", parentId: epic.id }), {
      params: { id: project.id },
    });
    const task = (await taskRes.json()).task;

    const patchRes = await patchTask(
      makeRequest(`${url}/${task.id}`, "PATCH", { kind: "category" }),
      { params: { id: project.id, taskId: task.id } }
    );
    expect(patchRes.status).toBe(200);
    const body = await patchRes.json();
    expect(body.task.kind).toBe("category");
  });

  it("rejects a task without a parentId (root-level tasks are not allowed)", async () => {
    const { project } = await makeOnboardedUserAndProject("root-task@acme-corp.com", "P8");
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    const res = await createTask(
      makeRequest(url, "POST", { name: "Root task", kind: "task" }),
      { params: { id: project.id } }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/must be created under an epic/i);
  });
});
describe("scheduleStatus lifecycle", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  async function makeEpicAndTask(
    email: string,
    taskOverrides: Record<string, unknown> = {}
  ) {
    const { project } = await makeOnboardedUserAndProject(email, `P-${email}`);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    const epicRes = await createTask(makeRequest(url, "POST", { name: "Epic", kind: "category" }), {
      params: { id: project.id },
    });
    const epic = (await epicRes.json()).task;
    const taskRes = await createTask(
      makeRequest(url, "POST", { name: "T", parentId: epic.id, ...taskOverrides }),
      { params: { id: project.id } }
    );
    const task = (await taskRes.json()).task;
    return { project, url, epic, task };
  }

  it("defaults to confirmed for API creation with explicit dates", async () => {
    const { task } = await makeEpicAndTask("ss-default@acme-corp.com", {
      startDate: new Date("2026-07-06").toISOString(),
      durationDays: 3,
    });
    expect(task.scheduleStatus).toBe("confirmed");
    // Confirmed creation baselines the original plan immediately.
    expect(task.originalEndDate).not.toBeNull();
    expect(task.originalDurationDays).toBe(3);
  });

  it("creates an estimated task with no baseline (a guess is not a plan)", async () => {
    const { task } = await makeEpicAndTask("ss-est@acme-corp.com", {
      startDate: new Date("2026-07-06").toISOString(),
      durationDays: 1,
      scheduleStatus: "estimated",
    });
    expect(task.scheduleStatus).toBe("estimated");
    expect(task.startDate).not.toBeNull();
    expect(task.originalEndDate).toBeNull();
    expect(task.originalDurationDays).toBe(0);
  });

  it("a drag on an estimated task confirms it without reason/delay dialogs and baselines the result", async () => {
    const { project, url, task } = await makeEpicAndTask("ss-drag@acme-corp.com", {
      startDate: new Date("2026-07-06").toISOString(),
      durationDays: 1,
      scheduleStatus: "estimated",
    });
    // No `reason`, no `confirmedDelay` — must still succeed.
    const res = await patchTask(
      makeRequest(`${url}/${task.id}`, "PATCH", {
        startDate: new Date("2026-07-20").toISOString(),
        durationDays: 4,
      }),
      { params: { id: project.id, taskId: task.id } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.scheduleStatus).toBe("confirmed");
    expect(body.task.durationDays).toBe(4);
    expect(body.task.originalDurationDays).toBe(4);
    expect(body.task.originalEndDate).not.toBeNull();
  });

  it("undo: an explicit revert to estimated skips plan guards and clears the baseline", async () => {
    const { project, url, task } = await makeEpicAndTask("ss-undo@acme-corp.com", {
      startDate: new Date("2026-07-06").toISOString(),
      durationDays: 1,
      scheduleStatus: "estimated",
    });
    // Confirm via drag…
    await patchTask(
      makeRequest(`${url}/${task.id}`, "PATCH", {
        startDate: new Date("2026-07-20").toISOString(),
        durationDays: 2,
      }),
      { params: { id: project.id, taskId: task.id } }
    );
    // …then undo restores the prior dates and the estimated flag with no reason.
    const res = await patchTask(
      makeRequest(`${url}/${task.id}`, "PATCH", {
        startDate: new Date("2026-07-06").toISOString(),
        durationDays: 1,
        scheduleStatus: "estimated",
        kind: "task",
      }),
      { params: { id: project.id, taskId: task.id } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.scheduleStatus).toBe("estimated");
    expect(body.task.durationDays).toBe(1);
    expect(body.task.originalEndDate).toBeNull();
    expect(body.task.originalDurationDays).toBe(0);
  });

  it("still requires a reason when rescheduling a confirmed task", async () => {
    const { project, url, task } = await makeEpicAndTask("ss-reason@acme-corp.com", {
      startDate: new Date("2026-07-06").toISOString(),
      durationDays: 2,
    });
    const res = await patchTask(
      makeRequest(`${url}/${task.id}`, "PATCH", {
        startDate: new Date("2026-07-01").toISOString(),
        durationDays: 2,
      }),
      { params: { id: project.id, taskId: task.id } }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/reason is required/i);
  });

  it("moving to the backlog clears dates; scheduling out of it confirms at the dropped date", async () => {
    const { project, url, task } = await makeEpicAndTask("ss-backlog@acme-corp.com", {
      startDate: new Date("2026-07-06").toISOString(),
      durationDays: 2,
    });
    const toBacklog = await patchTask(
      makeRequest(`${url}/${task.id}`, "PATCH", { scheduleStatus: "unscheduled" }),
      { params: { id: project.id, taskId: task.id } }
    );
    expect(toBacklog.status).toBe(200);
    const parked = (await toBacklog.json()).task;
    expect(parked.scheduleStatus).toBe("unscheduled");
    expect(parked.startDate).toBeNull();
    expect(parked.durationDays).toBe(0);
    expect(parked.originalEndDate).toBeNull();

    // Drop onto the timeline at a chosen date → confirmed, no reason needed.
    const dropped = await patchTask(
      makeRequest(`${url}/${task.id}`, "PATCH", {
        startDate: new Date("2026-08-03").toISOString(),
        durationDays: 1,
        scheduleStatus: "confirmed",
      }),
      { params: { id: project.id, taskId: task.id } }
    );
    expect(dropped.status).toBe(200);
    const scheduled = (await dropped.json()).task;
    expect(scheduled.scheduleStatus).toBe("confirmed");
    expect(scheduled.startDate).not.toBeNull();
    expect(scheduled.originalDurationDays).toBe(1);
  });

  it("creating in the backlog stores no dates regardless of what was sent", async () => {
    const { task } = await makeEpicAndTask("ss-backlog-create@acme-corp.com", {
      startDate: new Date("2026-07-06").toISOString(),
      durationDays: 5,
      scheduleStatus: "unscheduled",
    });
    expect(task.scheduleStatus).toBe("unscheduled");
    expect(task.startDate).toBeNull();
    expect(task.durationDays).toBe(0);
  });
});

describe("Milestones", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  async function makeEpic(email: string) {
    const { project } = await makeOnboardedUserAndProject(email, `P-${email}`);
    const url = `http://localhost:3000/api/projects/${project.id}/tasks`;
    const epicRes = await createTask(makeRequest(url, "POST", { name: "Epic", kind: "category" }), {
      params: { id: project.id },
    });
    const epic = (await epicRes.json()).task;
    return { project, url, epic };
  }

  it("creates a milestone as a zero-duration point", async () => {
    const { project, url, epic } = await makeEpic("ms-create@acme-corp.com");
    const res = await createTask(
      makeRequest(url, "POST", {
        name: "Launch",
        kind: "milestone",
        parentId: epic.id,
        startDate: new Date("2026-07-31").toISOString(),
        durationDays: 0,
      }),
      { params: { id: project.id } }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.task.kind).toBe("milestone");
    expect(body.task.durationDays).toBe(0);
    expect(body.task.startDate).not.toBeNull();
  });

  it("normalizes an imported milestone with duration > 0 to its end date", async () => {
    const { project, url, epic } = await makeEpic("ms-normalize@acme-corp.com");
    // Mon 2026-07-06 + 5 working days ends Fri 2026-07-10.
    const res = await createTask(
      makeRequest(url, "POST", {
        name: "Imported",
        kind: "milestone",
        parentId: epic.id,
        startDate: new Date("2026-07-06").toISOString(),
        durationDays: 5,
      }),
      { params: { id: project.id } }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.task.durationDays).toBe(0);
    expect(body.task.startDate.slice(0, 10)).toBe("2026-07-10");
  });

  it("rejects an unscheduled milestone (create and patch)", async () => {
    const { project, url, epic } = await makeEpic("ms-unsched@acme-corp.com");
    const createRes = await createTask(
      makeRequest(url, "POST", {
        name: "Bad",
        kind: "milestone",
        parentId: epic.id,
        startDate: new Date("2026-07-06").toISOString(),
        scheduleStatus: "unscheduled",
      }),
      { params: { id: project.id } }
    );
    expect(createRes.status).toBe(400);

    const okRes = await createTask(
      makeRequest(url, "POST", {
        name: "Good",
        kind: "milestone",
        parentId: epic.id,
        startDate: new Date("2026-07-06").toISOString(),
      }),
      { params: { id: project.id } }
    );
    const ms = (await okRes.json()).task;
    const patchRes = await patchTask(
      makeRequest(`${url}/${ms.id}`, "PATCH", { scheduleStatus: "unscheduled" }),
      { params: { id: project.id, taskId: ms.id } }
    );
    expect(patchRes.status).toBe(400);
    expect((await patchRes.json()).error).toMatch(/cannot be unscheduled/i);
  });

  it("task → milestone collapses to the end date; undo restores the original duration", async () => {
    const { project, url, epic } = await makeEpic("ms-convert@acme-corp.com");
    // Mon 2026-07-06, 5 working days → ends Fri 2026-07-10.
    const taskRes = await createTask(
      makeRequest(url, "POST", {
        name: "Build",
        parentId: epic.id,
        startDate: new Date("2026-07-06").toISOString(),
        durationDays: 5,
      }),
      { params: { id: project.id } }
    );
    const task = (await taskRes.json()).task;

    const convertRes = await patchTask(
      makeRequest(`${url}/${task.id}`, "PATCH", { kind: "milestone" }),
      { params: { id: project.id, taskId: task.id } }
    );
    expect(convertRes.status).toBe(200);
    const ms = (await convertRes.json()).task;
    expect(ms.kind).toBe("milestone");
    expect(ms.durationDays).toBe(0);
    expect(ms.startDate.slice(0, 10)).toBe("2026-07-10");

    // Undo: restore the exact prior state, including the original duration.
    const undoRes = await patchTask(
      makeRequest(`${url}/${task.id}`, "PATCH", {
        kind: "task",
        startDate: new Date("2026-07-06").toISOString(),
        durationDays: 5,
        scheduleStatus: "confirmed",
      }),
      { params: { id: project.id, taskId: task.id } }
    );
    expect(undoRes.status).toBe(200);
    const restored = (await undoRes.json()).task;
    expect(restored.kind).toBe("task");
    expect(restored.durationDays).toBe(5);
    expect(restored.startDate.slice(0, 10)).toBe("2026-07-06");
  });

  it("milestone → task expands into a 1-day bar on the milestone date", async () => {
    const { project, url, epic } = await makeEpic("ms-expand@acme-corp.com");
    const msRes = await createTask(
      makeRequest(url, "POST", {
        name: "Launch",
        kind: "milestone",
        parentId: epic.id,
        startDate: new Date("2026-07-31").toISOString(),
      }),
      { params: { id: project.id } }
    );
    const ms = (await msRes.json()).task;
    const res = await patchTask(
      makeRequest(`${url}/${ms.id}`, "PATCH", { kind: "task" }),
      { params: { id: project.id, taskId: ms.id } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.kind).toBe("task");
    expect(body.task.durationDays).toBe(1);
    expect(body.task.startDate.slice(0, 10)).toBe("2026-07-31");
  });

  it("blocks converting a task with subtasks to a milestone", async () => {
    const { project, url, epic } = await makeEpic("ms-subtasks@acme-corp.com");
    const parentRes = await createTask(
      makeRequest(url, "POST", {
        name: "Parent",
        parentId: epic.id,
        startDate: new Date("2026-07-06").toISOString(),
        durationDays: 2,
      }),
      { params: { id: project.id } }
    );
    const parent = (await parentRes.json()).task;
    await createTask(makeRequest(url, "POST", { name: "Sub", parentId: parent.id }), {
      params: { id: project.id },
    });
    const res = await patchTask(
      makeRequest(`${url}/${parent.id}`, "PATCH", { kind: "milestone" }),
      { params: { id: project.id, taskId: parent.id } }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/can't contain subtasks/i);
  });

  it("blocks converting an unscheduled (backlog) task to a milestone with a hint", async () => {
    const { project, url, epic } = await makeEpic("ms-from-backlog@acme-corp.com");
    const taskRes = await createTask(
      makeRequest(url, "POST", { name: "Parked", parentId: epic.id, scheduleStatus: "unscheduled" }),
      { params: { id: project.id } }
    );
    const task = (await taskRes.json()).task;
    const res = await patchTask(
      makeRequest(`${url}/${task.id}`, "PATCH", { kind: "milestone" }),
      { params: { id: project.id, taskId: task.id } }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/schedule this task first/i);
  });

  it("keeps dependencies attached through a task → milestone conversion", async () => {
    const { project, url, epic } = await makeEpic("ms-deps@acme-corp.com");
    const aRes = await createTask(
      makeRequest(url, "POST", {
        name: "A",
        parentId: epic.id,
        startDate: new Date("2026-07-06").toISOString(),
        durationDays: 2,
      }),
      { params: { id: project.id } }
    );
    const a = (await aRes.json()).task;
    const bRes = await createTask(
      makeRequest(url, "POST", {
        name: "B",
        parentId: epic.id,
        startDate: new Date("2026-07-08").toISOString(),
        durationDays: 2,
      }),
      { params: { id: project.id } }
    );
    const b = (await bRes.json()).task;
    await prisma.taskDependency.create({ data: { predecessorId: a.id, successorId: b.id } });

    const res = await patchTask(
      makeRequest(`${url}/${b.id}`, "PATCH", { kind: "milestone" }),
      { params: { id: project.id, taskId: b.id } }
    );
    expect(res.status).toBe(200);

    const listRes = await listTasks({} as never, { params: { id: project.id } });
    const list = await listRes.json();
    const converted = list.tasks.find((t: { id: string }) => t.id === b.id);
    expect(converted.kind).toBe("milestone");
    expect(converted.deps).toEqual([{ predecessorId: a.id }]);
  });
});
