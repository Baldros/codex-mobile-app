import { decideRunEvent, pickAttachableRun, startFailureDisposition } from "../src/domain/activeRun";
import type { BridgeRunSummary } from "../src/domain/bridge";

const run: BridgeRunSummary = { run_id: "run-1", thread_id: "thread-1", status: "running", created_at: "", updated_at: "", last_event_seq: 4 };

test("selects only the active run for the selected thread", () => {
  expect(pickAttachableRun([{ ...run, status: "completed" }, run], "thread-1")).toEqual({ id: "run-1", threadId: "thread-1" });
  expect(pickAttachableRun([run], "thread-2")).toBeNull();
});

test("keeps ambiguous server and transport start failures pending", () => {
  expect(startFailureDisposition({ status: 400 })).toBe("rejected");
  expect(startFailureDisposition({ status: 409 })).toBe("rejected");
  expect(startFailureDisposition({ status: 500 })).toBe("uncertain");
  expect(startFailureDisposition({})).toBe("uncertain");
});

test("accepts only the next event for the correct run and thread", () => {
  const event = (seq: number) => ({ event: "agent_message_delta", data: { run_id: "run-1", thread_id: "thread-1", event_seq: seq, text: "a" } });
  expect(decideRunEvent(event(49), "run-1", "thread-1", 50)).toBe("duplicate");
  expect(decideRunEvent(event(50), "run-1", "thread-1", 50)).toBe("duplicate");
  expect(decideRunEvent(event(51), "run-1", "thread-1", 50)).toBe("accept");
  expect(decideRunEvent(event(55), "run-1", "thread-1", 52)).toBe("gap");
  expect(decideRunEvent({ event: "done", data: { run_id: "other", event_seq: 51 } }, "run-1", "thread-1", 50)).toBe("invalid");
  expect(decideRunEvent({ event: "heartbeat", data: {} }, "run-1", "thread-1", 50)).toBe("heartbeat");
});
