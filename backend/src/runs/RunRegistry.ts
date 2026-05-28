import { randomUUID } from "node:crypto";

import { AppError } from "../errors.js";
import type { BridgeSseEvent } from "../sse.js";
import type { RunStreamBody } from "../validation.js";
import { AsyncQueue } from "../asyncQueue.js";
import type { BridgeThreadService } from "../appServer/types.js";

export type BridgeRunStatus = "starting" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled";

export type BridgeRunSummary = {
  run_id: string;
  thread_id: string;
  cwd?: string | undefined;
  status: BridgeRunStatus;
  created_at: string;
  updated_at: string;
  last_event_seq: number;
  error?: string | null | undefined;
};

type RunRecord = {
  internalId: string;
  runId: string | null;
  threadId: string;
  cwd?: string | undefined;
  status: BridgeRunStatus;
  createdAt: string;
  updatedAt: string;
  lastEventSeq: number;
  error: string | null;
  controller: AbortController;
  events: BridgeSseEvent[];
  subscribers: Set<AsyncQueue<BridgeSseEvent>>;
  ready: Promise<RunRecord>;
  resolveReady: (record: RunRecord) => void;
  rejectReady: (error: Error) => void;
};

export class RunRegistry {
  private readonly runs = new Map<string, RunRecord>();
  private readonly activeByThread = new Map<string, RunRecord>();
  private readonly maxBufferedEvents: number;

  constructor(
    private readonly threadService: BridgeThreadService,
    options: { maxBufferedEvents?: number } = {}
  ) {
    this.maxBufferedEvents = options.maxBufferedEvents ?? 1000;
  }

  async startRun(threadId: string, input: RunStreamBody) {
    const existing = this.activeByThread.get(threadId);
    if (existing && isActive(existing.status)) {
      throw new AppError(
        409,
        "thread_run_already_active",
        `Thread already has an active run: ${threadId}`
      );
    }

    const record = createRunRecord(threadId, input.cwd);
    this.activeByThread.set(threadId, record);
    void this.consumeRun(record, input);
    await record.ready;
    return toSummary(record);
  }

  listActiveRuns(filters: { threadId?: string | null; cwd?: string | null } = {}) {
    const runs = [...this.activeByThread.values()]
      .filter((run) => isActive(run.status))
      .filter((run) => !filters.threadId || run.threadId === filters.threadId)
      .filter((run) => !filters.cwd || run.cwd === filters.cwd)
      .filter((run) => run.runId !== null)
      .map(toSummary);

    return runs.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  getRun(runId: string) {
    const record = this.runs.get(runId);
    if (!record) {
      throw new AppError(404, "run_not_found", `Run not found: ${runId}`);
    }
    return toSummary(record);
  }

  subscribe(runId: string, sinceSeq = 0) {
    const record = this.runs.get(runId);
    if (!record) {
      throw new AppError(404, "run_not_found", `Run not found: ${runId}`);
    }

    const queue = new AsyncQueue<BridgeSseEvent>();
    for (const event of record.events) {
      const seq = eventSeq(event);
      if (seq > sinceSeq) {
        queue.push(event);
      }
    }

    if (isActive(record.status)) {
      record.subscribers.add(queue);
    } else {
      queue.close();
    }

    return {
      events: queue as AsyncIterable<BridgeSseEvent>,
      close: () => {
        record.subscribers.delete(queue);
        queue.close();
      }
    };
  }

  cancelRun(threadId: string, runId?: string) {
    if (runId) {
      const record = this.runs.get(runId);
      if (!record || record.threadId !== threadId || !isActive(record.status)) {
        return { cancelled: false, thread_id: threadId, run_id: runId };
      }

      record.controller.abort();
      return { cancelled: true, thread_id: threadId, run_id: runId };
    }

    const record = this.activeByThread.get(threadId);
    if (!record || !isActive(record.status)) {
      return { cancelled: false, thread_id: threadId, run_ids: [] };
    }

    record.controller.abort();
    return {
      cancelled: true,
      thread_id: threadId,
      run_ids: record.runId ? [record.runId] : []
    };
  }

  private async consumeRun(record: RunRecord, input: RunStreamBody) {
    let sawTerminalEvent = false;

    try {
      for await (const event of this.threadService.runThread(record.threadId, input, record.controller.signal)) {
        const buffered = this.bufferEvent(record, event);
        this.updateRecordFromEvent(record, buffered);
        this.publish(record, buffered);

        if (buffered.event === "done") {
          sawTerminalEvent = true;
          break;
        }
      }

      if (!sawTerminalEvent && isActive(record.status)) {
        const status = record.controller.signal.aborted ? "cancelled" : "completed";
        const done = this.bufferEvent(record, {
          event: "done",
          data: {
            thread_id: record.threadId,
            run_id: record.runId ?? record.internalId,
            status
          }
        });
        this.updateRecordFromEvent(record, done);
        this.publish(record, done);
      }
    } catch (caught) {
      const message = errorMessage(caught);
      const errorEvent = this.bufferEvent(record, {
        event: "error",
        data: {
          thread_id: record.threadId,
          run_id: record.runId ?? record.internalId,
          message
        }
      });
      this.updateRecordFromEvent(record, errorEvent);
      this.publish(record, errorEvent);

      const done = this.bufferEvent(record, {
        event: "done",
        data: {
          thread_id: record.threadId,
          run_id: record.runId ?? record.internalId,
          status: record.controller.signal.aborted ? "cancelled" : "failed"
        }
      });
      this.updateRecordFromEvent(record, done);
      this.publish(record, done);

      if (!record.runId) {
        record.rejectReady(caught instanceof Error ? caught : new Error(message));
      }
    } finally {
      if (this.activeByThread.get(record.threadId) === record) {
        this.activeByThread.delete(record.threadId);
      }
      if (!record.runId) {
        record.runId = record.internalId;
        this.runs.set(record.runId, record);
        record.resolveReady(record);
      }
      for (const subscriber of record.subscribers) {
        subscriber.close();
      }
      record.subscribers.clear();
    }
  }

  private bufferEvent(record: RunRecord, event: BridgeSseEvent) {
    const buffered = withEventSeq(event, ++record.lastEventSeq);
    record.events.push(buffered);
    if (record.events.length > this.maxBufferedEvents) {
      record.events.splice(0, record.events.length - this.maxBufferedEvents);
    }
    record.updatedAt = new Date().toISOString();
    return buffered;
  }

  private publish(record: RunRecord, event: BridgeSseEvent) {
    for (const subscriber of record.subscribers) {
      subscriber.push(event);
    }
  }

  private updateRecordFromEvent(record: RunRecord, event: BridgeSseEvent) {
    const data = event.data as Record<string, unknown>;

    if (event.event === "run_started") {
      const runId = asString(data.run_id);
      if (runId) {
        record.runId = runId;
        this.runs.set(runId, record);
        record.status = "running";
        record.resolveReady(record);
      }
      return;
    }

    if (event.event === "approval_requested" && isActive(record.status)) {
      record.status = "waiting_approval";
      return;
    }

    if (event.event !== "heartbeat" && record.status === "waiting_approval") {
      record.status = "running";
    }

    if (event.event === "error") {
      record.error = asString(data.message) ?? "Run failed.";
      return;
    }

    if (event.event === "done") {
      const status = asString(data.status);
      if (status === "cancelled") {
        record.status = "cancelled";
      } else if (status === "failed" || record.error) {
        record.status = "failed";
      } else {
        record.status = "completed";
      }
    }
  }
}

function createRunRecord(threadId: string, cwd?: string): RunRecord {
  const now = new Date().toISOString();
  const internalId = `pending_${randomUUID()}`;
  let resolveReady: (record: RunRecord) => void = () => undefined;
  let rejectReady: (error: Error) => void = () => undefined;
  const ready = new Promise<RunRecord>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  return {
    internalId,
    runId: null,
    threadId,
    cwd,
    status: "starting",
    createdAt: now,
    updatedAt: now,
    lastEventSeq: 0,
    error: null,
    controller: new AbortController(),
    events: [],
    subscribers: new Set(),
    ready,
    resolveReady,
    rejectReady
  };
}

function toSummary(record: RunRecord): BridgeRunSummary {
  return {
    run_id: record.runId ?? record.internalId,
    thread_id: record.threadId,
    cwd: record.cwd,
    status: record.status,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    last_event_seq: record.lastEventSeq,
    error: record.error
  };
}

function isActive(status: BridgeRunStatus) {
  return status === "starting" || status === "running" || status === "waiting_approval";
}

function withEventSeq(event: BridgeSseEvent, seq: number): BridgeSseEvent {
  if (typeof event.data === "object" && event.data !== null && !Array.isArray(event.data)) {
    return {
      event: event.event,
      data: {
        ...(event.data as Record<string, unknown>),
        event_seq: seq
      }
    };
  }

  return {
    event: event.event,
    data: {
      value: event.data,
      event_seq: seq
    }
  };
}

function eventSeq(event: BridgeSseEvent) {
  const data = event.data as Record<string, unknown>;
  return typeof data.event_seq === "number" ? data.event_seq : 0;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
