import type { BridgeRunSummary, BridgeSseEvent } from "./bridge";

export function isActiveRunStatus(status: string) {
  return status === "starting" || status === "running" || status === "waiting_approval";
}

export function pickAttachableRun(runs: BridgeRunSummary[], threadId: string | null | undefined) {
  if (!threadId) return null;
  const run = runs.find((item) => item.thread_id === threadId && isActiveRunStatus(item.status));
  return run ? { id: run.run_id, threadId: run.thread_id } : null;
}

export type EventDecision = "heartbeat" | "accept" | "duplicate" | "gap" | "invalid";

export function decideRunEvent(event: BridgeSseEvent, runId: string, threadId: string, lastAcceptedSeq: number): EventDecision {
  if (event.event === "heartbeat") return "heartbeat";
  const data = event.data;
  if (!data || typeof data !== "object") return "invalid";
  const item = data as Record<string, unknown>;
  if (item.run_id !== undefined && item.run_id !== runId) return "invalid";
  if (item.thread_id !== undefined && item.thread_id !== threadId) return "invalid";
  const seq = item.event_seq;
  if (!Number.isSafeInteger(seq) || typeof seq !== "number" || seq <= 0) return "invalid";
  if (seq <= lastAcceptedSeq) return "duplicate";
  if (seq !== lastAcceptedSeq + 1) return "gap";
  return "accept";
}
