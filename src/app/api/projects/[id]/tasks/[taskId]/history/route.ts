import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireMembership } from "@/lib/projectAuth";
import { TASK_FIELD_LABELS } from "@/lib/validation";
import { fmtDate } from "@/lib/dateUtils";

const STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  delayed: "Delayed",
  blocked: "Blocked",
  completed: "Completed",
  archived: "Archived",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

function formatValue(field: string, value: string | null): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "status") return STATUS_LABELS[value] ?? value;
  if (field === "priority") return PRIORITY_LABELS[value] ?? value;
  if (field === "startDate") return fmtDate(new Date(value));
  return value;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; taskId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const authz = await requireMembership(params.id, session.user.id);
  if (!authz.ok) return authz.response;

  const existing = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!existing || existing.projectId !== params.id) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const entries = await prisma.taskHistory.findMany({
    where: { taskId: params.taskId },
    include: { changedBy: true },
    orderBy: { changedAt: "desc" },
  });

  const history = entries.map((e) => ({
    id: e.id,
    field: e.field,
    fieldLabel: TASK_FIELD_LABELS[e.field] ?? e.field,
    oldValue: e.oldValue,
    newValue: e.newValue,
    reason: e.reason,
    oldLabel: formatValue(e.field, e.oldValue),
    newLabel: formatValue(e.field, e.newValue),
    changedAt: e.changedAt.toISOString(),
    changedBy: {
      id: e.changedBy.id,
      name: `${e.changedBy.firstName ?? ""} ${e.changedBy.lastName ?? ""}`.trim() || e.changedBy.email,
      initials: initials(e.changedBy.firstName, e.changedBy.lastName),
      color: e.changedBy.avatarColor ?? "#4F5DFF",
    },
  }));

  return NextResponse.json({ history });
}

function initials(first?: string | null, last?: string | null): string {
  const parts = [first, last].filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .map((p) => p![0].toUpperCase())
    .slice(0, 2)
    .join("");
}