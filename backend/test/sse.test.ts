import { describe, expect, it } from "vitest";

import { formatSseEvent } from "../src/sse.js";

describe("SSE formatting", () => {
  it("serializes compact JSON data blocks", () => {
    const text = formatSseEvent("agent_message", {
      thread_id: "thr_1",
      text: "hello"
    });

    expect(text).toBe('event: agent_message\ndata: {"thread_id":"thr_1","text":"hello"}\n\n');
  });
});
