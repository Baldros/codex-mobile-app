import { randomUUID } from "node:crypto";

export type ThreadRecord = {
  id: string;
  title: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  runtimeThreadId: string | null;
};

export class InMemoryThreadStore {
  private readonly threads = new Map<string, ThreadRecord>();

  create(input: { title?: string | undefined; cwd: string }) {
    const now = new Date().toISOString();
    const thread: ThreadRecord = {
      id: `thr_${randomUUID()}`,
      title: input.title ?? "Untitled thread",
      cwd: input.cwd,
      createdAt: now,
      updatedAt: now,
      runtimeThreadId: null
    };

    this.threads.set(thread.id, thread);
    return thread;
  }

  list() {
    return [...this.threads.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }

  get(id: string) {
    return this.threads.get(id) ?? null;
  }

  update(id: string, updates: Partial<Pick<ThreadRecord, "runtimeThreadId" | "title" | "cwd">>) {
    const current = this.threads.get(id);
    if (!current) {
      return null;
    }

    const updated: ThreadRecord = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.threads.set(id, updated);
    return updated;
  }
}
