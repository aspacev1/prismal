import { describe, it, expect } from "vitest";
import { isDependentTask, dependentTaskIds } from "@/lib/taskUtils";

describe("isDependentTask", () => {
  it("returns false for a task with no deps and no successorDeps", () => {
    expect(isDependentTask({ id: "t1", deps: [], successorDeps: [] })).toBe(false);
  });

  it("returns true for a task with an entry in deps (has a predecessor)", () => {
    expect(
      isDependentTask({
        id: "t2",
        deps: [{ predecessorId: "t1", dependencyType: "FS" }],
        successorDeps: [],
      })
    ).toBe(true);
  });

  it("returns true for a task with an entry in successorDeps (is a predecessor)", () => {
    expect(
      isDependentTask({
        id: "t1",
        deps: [],
        successorDeps: [{ id: "dep-1" }],
      })
    ).toBe(true);
  });

  it("returns false when both arrays are missing/undefined", () => {
    expect(isDependentTask({ id: "t3" })).toBe(false);
  });
});

describe("dependentTaskIds", () => {
  it("collects both successors and predecessors", () => {
    const tasks = [
      { id: "a", deps: [{ predecessorId: "b", dependencyType: "FS" }], successorDeps: [] },
      { id: "b", deps: [], successorDeps: [{ id: "d1" }] },
      { id: "c", deps: [], successorDeps: [] },
    ];
    const ids = dependentTaskIds(tasks);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(false);
  });

  it("returns an empty set for tasks with no deps", () => {
    const ids = dependentTaskIds([
      { id: "x", deps: [], successorDeps: [] },
      { id: "y", deps: [], successorDeps: [] },
    ]);
    expect(ids.size).toBe(0);
  });
});