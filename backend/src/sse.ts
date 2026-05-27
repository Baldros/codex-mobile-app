import type { ServerResponse } from "node:http";

export type BridgeSseEvent = {
  event: string;
  data: unknown;
};

export class SseWriter {
  constructor(private readonly res: ServerResponse) {}

  open() {
    this.res.statusCode = 200;
    this.res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    this.res.setHeader("Cache-Control", "no-cache, no-transform");
    this.res.setHeader("Connection", "keep-alive");
    this.res.setHeader("X-Accel-Buffering", "no");
    this.res.flushHeaders?.();
  }

  write(event: string, data: unknown) {
    this.res.write(formatSseEvent(event, data));
  }

  end() {
    this.res.end();
  }
}

export function formatSseEvent(event: string, data: unknown) {
  const json = JSON.stringify(data);
  return `event: ${event}\ndata: ${json}\n\n`;
}
