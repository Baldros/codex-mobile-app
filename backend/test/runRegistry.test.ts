import { describe, expect, it, vi } from "vitest";

import { RunRegistry } from "../src/runs/RunRegistry.js";
import type { BridgeThreadService } from "../src/appServer/types.js";

function service(events: Array<{ event: string; data: Record<string, unknown> }>, onStart?: () => void): BridgeThreadService {
  return {
    async *runThread() {
      onStart?.();
      for (const event of events) yield event;
    }
  } as unknown as BridgeThreadService;
}

async function collect(registry: RunRegistry, runId: string, since = 0) {
  const subscription = registry.subscribe(runId, since);
  const events = [];
  for await (const event of subscription.events) events.push(event);
  subscription.close();
  return events;
}

describe("RunRegistry replay", () => {
  it("keeps sequence identity and replays only events after the accepted cursor", async () => {
    let starts = 0;
    const registry = new RunRegistry(service([
      { event: "run_started", data: { run_id: "run-1", thread_id: "thread-1" } },
      { event: "agent_message_delta", data: { run_id: "run-1", text: "hello" } },
      { event: "done", data: { run_id: "run-1", status: "completed" } }
    ], () => { starts += 1; }), { maxBufferedEvents: 5 });
    const input = { message: "Hi", client_request_id: "request_123456" };
    const first = await registry.startRun("thread-1", input);
    const again = await registry.startRun("thread-1", input);
    expect(again.run_id).toBe(first.run_id);
    expect(starts).toBe(1);
    expect((await collect(registry, first.run_id)).map((event) => (event.data as { event_seq: number }).event_seq)).toEqual([1, 2, 3]);
    expect((await collect(registry, first.run_id, 1)).map((event) => (event.data as { event_seq: number }).event_seq)).toEqual([2, 3]);
    registry.dispose();
  });

  it("reports a replay gap instead of silently skipping dropped events", async () => {
    const registry = new RunRegistry(service([
      { event: "run_started", data: { run_id: "run-2" } },
      { event: "agent_message_delta", data: { run_id: "run-2", text: "a" } },
      { event: "agent_message_delta", data: { run_id: "run-2", text: "b" } },
      { event: "done", data: { run_id: "run-2", status: "completed" } }
    ]), { maxBufferedEvents: 2 });
    await registry.startRun("thread-2", { message: "Hi" });
    await vi.waitFor(() => expect(registry.getRun("run-2").status).toBe("completed"));
    await collect(registry, "run-2", 2);
    expect(() => registry.subscribe("run-2", 1)).toThrowError(expect.objectContaining({
      code: "replay_gap",
      details: expect.objectContaining({ oldest_available_seq: 3, latest_seq: 4 })
    }));
    registry.dispose();
  });

  it("expires terminal records and request keys after retention", async () => {
    vi.useFakeTimers();
    try {
      const registry = new RunRegistry(service([
        { event: "run_started", data: { run_id: "run-3" } },
        { event: "done", data: { run_id: "run-3", status: "failed" } }
      ]), { runRetentionMs: 1000 });
      await registry.startRun("thread-3", { message: "Hi", client_request_id: "request_abcdef" });
      await collect(registry, "run-3");
      expect(registry.getRun("run-3").status).toBe("failed");
      await vi.advanceTimersByTimeAsync(1001);
      expect(() => registry.getRun("run-3")).toThrow();
      expect(() => registry.getRequest("thread-3", "request_abcdef")).toThrow();
      registry.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds a stalled subscriber and lets independent subscribers replay", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const threadService = {
      async *runThread() {
        yield { event: "run_started", data: { run_id: "run-4" } };
        await gate;
        yield { event: "agent_message_delta", data: { run_id: "run-4", text: "a" } };
        yield { event: "agent_message_delta", data: { run_id: "run-4", text: "b" } };
        yield { event: "done", data: { run_id: "run-4", status: "completed" } };
      }
    } as unknown as BridgeThreadService;
    const registry = new RunRegistry(threadService, { maxBufferedEvents: 2 });
    await registry.startRun("thread-4", { message: "Hi" });
    const slow = registry.subscribe("run-4", 1);
    release();
    await vi.waitFor(() => expect(registry.getRun("run-4").status).toBe("completed"));
    expect((await collect(registry, "run-4", 2)).map((event) => (event.data as { event_seq: number }).event_seq)).toEqual([3, 4]);
    await expect(slow.events[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: "replay_gap" });
    slow.close();
    registry.dispose();
  });
});
