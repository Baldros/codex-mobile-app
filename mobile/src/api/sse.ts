import type { BridgeSseEvent } from "../domain/bridge";

export class SseStreamDecoder {
  private buffer = "";

  push(chunk: string) {
    this.buffer += chunk;
    const events: BridgeSseEvent[] = [];

    while (true) {
      const separator = findEventSeparator(this.buffer);
      if (separator.index === -1) {
        break;
      }

      const block = this.buffer.slice(0, separator.index);
      this.buffer = this.buffer.slice(separator.index + separator.length);
      const event = parseSseBlock(block);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  flush() {
    const block = this.buffer.trim();
    this.buffer = "";
    const event = parseSseBlock(block);
    return event ? [event] : [];
  }
}

export function parseSseBlock(block: string): BridgeSseEvent | null {
  const trimmed = block.trim();
  if (!trimmed) {
    return null;
  }

  let event = "message";
  const dataLines: string[] = [];

  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  const dataText = dataLines.join("\n");
  let data: unknown = {};
  if (dataText.length > 0) {
    try {
      data = JSON.parse(dataText);
    } catch {
      data = { text: dataText };
    }
  }

  return { event, data: data as Record<string, unknown> };
}

function findEventSeparator(input: string) {
  const lf = input.indexOf("\n\n");
  const crlf = input.indexOf("\r\n\r\n");

  if (lf === -1 && crlf === -1) {
    return { index: -1, length: 0 };
  }

  if (lf === -1) {
    return { index: crlf, length: 4 };
  }

  if (crlf === -1) {
    return { index: lf, length: 2 };
  }

  return lf < crlf ? { index: lf, length: 2 } : { index: crlf, length: 4 };
}
