export type AssigneePerson = {
  id: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatarColor: string | null;
    department: string | null;
  };
};

export type TaskKind = "category" | "task";

// "estimated": dates guessed at creation (ghost bar, dashed). "confirmed":
// user-chosen dates (solid bar). "unscheduled": parked in the backlog, no bar.
export type ScheduleStatus = "estimated" | "confirmed" | "unscheduled";

export type DepRef = { predecessorId: string };

export type TaskRow = {
  id: string;
  name: string;
  description: string | null;
  kind: TaskKind;
  scheduleStatus: ScheduleStatus;
  startDate: string | null;
  durationDays: number;
  originalEndDate: string | null;
  originalDurationDays: number;
  loggedHours: number;
  progress: number;
  status: string;
  priority: string;
  order: number;
  color: string | null;
  projectId: string;
  parentId: string | null;
  assigneeId: string | null;
  assignee: AssigneePerson | null;
  deps: DepRef[];
  isSubtask: boolean;
};

export type MemberOption = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  position: string;
  avatarColor: string | null;
  isCurrentUser: boolean;
};

export type HistoryEntry = {
  id: string;
  field: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  oldLabel: string;
  newLabel: string;
  changedAt: string;
  changedBy: {
    id: string;
    name: string;
    initials: string;
    color: string;
  };
};

export type MentionInfo = {
  id: string;
  name: string;
  initials: string;
  color: string;
};

export type CommentEntry = {
  id: string;
  body: string;
  mentions: MentionInfo[];
  author: {
    id: string;
    name: string;
    initials: string;
    color: string;
  };
  isAuthor: boolean;
  createdAt: string;
};

export type TaskDraft = {
  name: string;
  description: string | null;
  startDate: string | null;
  durationDays: number;
  status: string;
  priority: string;
  assigneeId: string | null;
  progress: number;
};

export type FeedEntry =
  | { kind: "history"; entry: HistoryEntry; timestamp: string }
  | { kind: "comment"; entry: CommentEntry; timestamp: string };

export type FeedFilter = "all" | "comments" | "schedule";