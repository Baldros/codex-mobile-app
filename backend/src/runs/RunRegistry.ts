import { randomUUID } from "node:crypto";

import { AppError } from "../errors.js";
import type { BridgeSseEvent } from "../sse.js";
import type { RunStreamBody } from "../validation.js";
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
  subscribers: Set<RunSubscriber>;
  clientRequestId?: string | undefined;
  requestFingerprint?: string | undefined;
  ready: Promise<RunRecord>;
  resolveReady: (record: RunRecord) => void;
  rejectReady: (error: Error) => void;
};

type RunSubscriber = {
  closed: boolean;
  wake: (() => void) | null;
};

export class RunRegistry {
  private readonly runs = new Map<string, RunRecord>();
  private readonly activeByThread = new Map<string, RunRecord>();
  private readonly requests = new Map<string, RunRecord>();
  private readonly maxBufferedEvents: number;
  private readonly retentionMs: number;
  private readonly retentionTimers = new Set<NodeJS.Timeout>();
  private disposed = false;

  constructor(
    private readonly threadService: BridgeThreadService,
    options: { maxBufferedEvents?: number; runRetentionMs?: number } = {}
  ) {
    this.maxBufferedEvents = options.maxBufferedEvents ?? 5000;
    this.retentionMs = options.runRetentionMs ?? 300_000;
  }

  async startRun(threadId: string, input: RunStreamBody) {
    if (this.disposed) throw new AppError(503, "bridge_stopping", "Bridge is stopping.");
    const requestKey = input.client_request_id ? `${threadId}\0${input.client_request_id}` : null;
    if (requestKey) {
      const previous = this.requests.get(requestKey);
      if (previous) {
        if (previous.requestFingerprint !== JSON.stringify(input)) {
          throw new AppError(409, "request_id_conflict", "Request ID was used with different input.");
        }
        await previous.ready;
        return toSummary(previous);
      }
    }
    const existing = this.activeByThread.get(threadId);
    if (existing && isActive(existing.status)) {
      throw new AppError(
        409,
        "thread_run_already_active",
        `Thread already has an active run: ${threadId}`
      );
    }

    const record = createRunRecord(threadId, input.cwd);
    record.clientRequestId = input.client_request_id;
    record.requestFingerprint = JSON.stringify(input);
    if (requestKey) {
      this.requests.set(requestKey, record);
    }
    this.activeByThread.set(threadId, record);
    void this.consumeRun(record, input);
    await record.ready;
    return toSummary(record);
  }

  getRequest(threadId: string, requestId: string) {
    const record = this.requests.get(`${threadId}\0${requestId}`);
    if (!record) {
      throw new AppError(404, "run_request_not_found", "Run request is not retained.");
    }
    return {
      state: record.status === "starting" ? "starting" : "known",
      run: record.runId ? toSummary(record) : null
    };
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

    if (!Number.isSafeInteger(sinceSeq) || sinceSeq < 0 || sinceSeq > record.lastEventSeq) {
      throw new AppError(400, "invalid_cursor", "Invalid run event cursor.");
    }
    if (sinceSeq < oldestSeq(record) - 1) {
      throw replayGap(record, sinceSeq);
    }
    if (record.subscribers.size >= 16) {
      throw new AppError(429, "too_many_subscribers", "Run has too many event subscribers.");
    }
    const subscriber: RunSubscriber = { closed: false, wake: null };
    record.subscribers.add(subscriber);
    let nextSeq = sinceSeq + 1;
    return {
      events: (async function* () {
        try {
          while (!subscriber.closed) {
            if (nextSeq < oldestSeq(record)) {
              throw replayGap(record, nextSeq - 1);
            }
            if (nextSeq <= record.lastEventSeq) {
              const event = record.events[(nextSeq - 1) % record.events.length];
              // The ring may have wrapped after the bounds check above.
              if (!event || eventSeq(event) !== nextSeq) {
                throw replayGap(record, nextSeq - 1);
              }
              nextSeq += 1;
              yield event;
              continue;
            }
            if (!isActive(record.status)) {
              return;
            }
            await new Promise<void>((resolve) => {
              subscriber.wake = resolve;
              if (subscriber.closed || nextSeq <= record.lastEventSeq || !isActive(record.status)) {
                subscriber.wake = null;
                resolve();
              }
            });
          }
        } finally {
          record.subscribers.delete(subscriber);
        }
      })(),
      close: () => {
        subscriber.closed = true;
        record.subscribers.delete(subscriber);
        subscriber.wake?.();
        subscriber.wake = null;
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
      if (!record.runId && !this.disposed) {
        record.runId = record.internalId;
        this.runs.set(record.runId, record);
        record.resolveReady(record);
      }
      this.notify(record);
      record.subscribers.clear();
      if (!this.disposed) this.scheduleRetention(record);
    }
  }

  private bufferEvent(record: RunRecord, event: BridgeSseEvent) {
    const buffered = withEventSeq(event, ++record.lastEventSeq);
    const slot = (record.lastEventSeq - 1) % this.maxBufferedEvents;
    record.events[slot] = buffered;
    record.updatedAt = new Date().toISOString();
    return buffered;
  }

  private publish(record: RunRecord, event: BridgeSseEvent) {
    void event;
    this.notify(record);
  }

  private notify(record: RunRecord) {
    for (const subscriber of record.subscribers) {
      const wake = subscriber.wake;
      subscriber.wake = null;
      wake?.();
    }
  }

  private scheduleRetention(record: RunRecord) {
    const timer = setTimeout(() => {
      this.retentionTimers.delete(timer);
      if (isActive(record.status)) return;
      if (record.runId) this.runs.delete(record.runId);
      if (record.clientRequestId) this.requests.delete(`${record.threadId}\0${record.clientRequestId}`);
      record.events.length = 0;
      record.subscribers.clear();
    }, this.retentionMs);
    timer.unref();
    this.retentionTimers.add(timer);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const timer of this.retentionTimers) clearTimeout(timer);
    this.retentionTimers.clear();
    const records = new Set([...this.runs.values(), ...this.activeByThread.values()]);
    for (const record of records) {
      record.controller.abort();
      if (!record.runId) record.rejectReady(new AppError(503, "bridge_stopping", "Bridge is stopping."));
      for (const subscriber of record.subscribers) {
        subscriber.closed = true;
        subscriber.wake?.();
      }
      record.subscribers.clear();
      record.events.length = 0;
    }
    this.runs.clear();
    this.activeByThread.clear();
    this.requests.clear();
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

function oldestSeq(record: RunRecord) {
  return Math.max(1, record.lastEventSeq - record.events.length + 1);
}

function replayGap(record: RunRecord, requestedSinceSeq: number) {
  return new AppError(409, "replay_gap", "Run event history no longer covers the requested cursor.", {
    run_id: record.runId ?? record.internalId,
    requested_since_seq: requestedSinceSeq,
    oldest_available_seq: oldestSeq(record),
    latest_seq: record.lastEventSeq
  });
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
