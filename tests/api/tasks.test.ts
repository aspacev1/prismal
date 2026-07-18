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