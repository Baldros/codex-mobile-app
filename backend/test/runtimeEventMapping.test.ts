import { describe, expect, it } from "vitest";

import { mapRuntimeEvent } from "../src/runtime/mapRuntimeEvent.js";

describe("runtime event mapping", () => {
  const context = {
    threadId: "thr_1",
    runId: "run_1"
  };

  it("maps command lifecycle events to mobile-facing tool events", () => {
    const started = mapRuntimeEvent(
      {
        type: "item.started",
        item: {
          id: "item_1",
          type: "command_execution",
          command: "npm test",
          aggregated_output: "",
          status: "in_progress"
        }
      },
      context
    );

    const completed = mapRuntimeEvent(
      {
        type: "item.completed",
        item: {
          id: "item_1",
          type: "command_execution",
          command: "npm test",
          aggregated_output: "ok",
          exit_code: 0,
          status: "completed"
        }
      },
      context
    );

    expect(started).toEqual([
      {
        event: "tool_start",
        data: {
          thread_id: "thr_1",
          run_id: "run_1",
          item_id: "item_1",
          kind: "command_execution",
          command: "npm test"
        }
      }
    ]);
    expect(completed[0]).toMatchObject({
      event: "tool_end",
      data: {
        output: "ok",
        exit_code: 0,
        status: "completed"
      }
    });
  });

  it("maps failed turns to error and done events", () => {
    const events = mapRuntimeEvent(
      {
        type: "turn.failed",
        error: {
          message: "runtime failed"
        }
      },
      context
    );

    expect(events).toEqual([
      {
        event: "error",
        data: {
          thread_id: "thr_1",
          run_id: "run_1",
          message: "runtime failed"
        }
      },
      {
        event: "done",
        data: {
          thread_id: "thr_1",
          run_id: "run_1",
          status: "failed"
        }
      }
    ]);
  });
});
