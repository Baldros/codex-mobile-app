import { SseStreamDecoder, parseSseBlock } from "../src/api/sse";

describe("SSE parser", () => {
  it("parses a single event block", () => {
    expect(parseSseBlock('event: done\ndata: {"status":"completed"}')).toEqual({
      event: "done",
      data: {
        status: "completed"
      }
    });
  });

  it("keeps incomplete chunks until the block is complete", () => {
    const decoder = new SseStreamDecoder();

    expect(decoder.push('event: agent_message_delta\ndata: {"text":"ol')).toEqual([]);
    expect(decoder.push('a"}\n\n')).toEqual([
      {
        event: "agent_message_delta",
        data: {
          text: "ola"
        }
      }
    ]);
  });

  it("flushes the last event without a trailing separator", () => {
    const decoder = new SseStreamDecoder();
    decoder.push('event: run_started\ndata: {"run_id":"r1"}');

    expect(decoder.flush()).toEqual([
      {
        event: "run_started",
        data: {
          run_id: "r1"
        }
      }
    ]);
  });
});
