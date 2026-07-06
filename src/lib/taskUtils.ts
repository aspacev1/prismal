// Client-side task utilities — pure functions for filtering/dependency logic.
// Kept in src/lib (not in a component) so they can be unit-tested directly,
// matching this codebase's convention of testing lib/api layers, not React.

export type DepRef = { predecessorId: string; dependencyType?: string };
export type DependentTask = {
  id: string;
  deps?: DepRef[];
  successorDeps?: { id: string }[];
};

/**
 * Returns true if the task participates in any dependency relationship —
 * either as a successor (has predecessors in `deps`) or as a predecessor
 * (appears in another task's `deps` via the `successorDeps` include).
 * Categories never participate in dependencies directly.
 */
export function isDependentTask(task: DependentTask): boolean {
  if ((task.deps ?? []).length > 0) return true;
  if ((task.successorDeps ?? []).length > 0) return true;
  return false;
}

/**
 * Given a list of tasks, returns the set of ids that participate in any
 * dependency relationship (as predecessor or successor). Useful for the
 * "Show only dependent tasks" filter.
 */
export function dependentTaskIds(tasks: DependentTask[]): Set<string> {
  const ids = new Set<string>();
  for (const t of tasks) {
    const ds = t.deps ?? [];
    if (ds.length > 0) {
      ids.add(t.id);
      for (const d of ds) ids.add(d.predecessorId);
    }
  }
  return ids;
}