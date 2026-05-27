import type { ThreadItem } from "@openai/codex-sdk";

import type { BridgeSseEvent } from "../sse.js";

import type { RuntimeThreadEvent } from "./types.js";

export type RuntimeEventContext = {
  threadId: string;
  runId: string;
};

export function mapRuntimeEvent(event: RuntimeThreadEvent, context: RuntimeEventContext): BridgeSseEvent[] {
  switch (event.type) {
    case "thread.started":
      return [
        {
          event: "thread_started",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            runtime_thread_id: event.thread_id
          }
        }
      ];

    case "turn.started":
      return [];

    case "turn.completed":
      return [
        {
          event: "done",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            status: "completed",
            usage: event.usage
          }
        }
      ];

    case "turn.failed":
      return [
        {
          event: "error",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            message: event.error.message
          }
        },
        {
          event: "done",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            status: "failed"
          }
        }
      ];

    case "error":
      return [
        {
          event: "error",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            message: event.message
          }
        }
      ];

    case "item.started":
      return mapItemEvent("started", event.item, context);

    case "item.updated":
      return mapItemEvent("updated", event.item, context);

    case "item.completed":
      return mapItemEvent("completed", event.item, context);
  }
}

function mapItemEvent(
  state: "started" | "updated" | "completed",
  item: ThreadItem,
  context: RuntimeEventContext
): BridgeSseEvent[] {
  const threadEventItem = item as unknown as {
    id: string;
    type: string;
    [key: string]: unknown;
  };

  switch (threadEventItem.type) {
    case "agent_message":
      return [
        {
          event: state === "completed" ? "agent_message" : "agent_message_delta",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            item_id: threadEventItem.id,
            text: threadEventItem.text
          }
        }
      ];

    case "reasoning":
      return [
        {
          event: "reasoning_summary",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            item_id: threadEventItem.id,
            text: threadEventItem.text
          }
        }
      ];

    case "command_execution":
      if (state === "started") {
        return [
          {
            event: "tool_start",
            data: {
              thread_id: context.threadId,
              run_id: context.runId,
              item_id: threadEventItem.id,
              kind: "command_execution",
              command: threadEventItem.command
            }
          }
        ];
      }

      return [
        {
          event: state === "completed" ? "tool_end" : "command_output",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            item_id: threadEventItem.id,
            kind: "command_execution",
            command: threadEventItem.command,
            output: threadEventItem.aggregated_output,
            exit_code: threadEventItem.exit_code,
            status: threadEventItem.status
          }
        }
      ];

    case "file_change":
      return [
        {
          event: "file_change",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            item_id: threadEventItem.id,
            changes: threadEventItem.changes,
            status: threadEventItem.status
          }
        }
      ];

    case "mcp_tool_call":
      return [
        {
          event: state === "started" ? "tool_start" : "tool_end",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            item_id: threadEventItem.id,
            kind: "mcp_tool_call",
            server: threadEventItem.server,
            tool: threadEventItem.tool,
            status: threadEventItem.status,
            error: threadEventItem.error
          }
        }
      ];

    case "web_search":
      return [
        {
          event: state === "started" ? "tool_start" : "tool_end",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            item_id: threadEventItem.id,
            kind: "web_search",
            query: threadEventItem.query
          }
        }
      ];

    case "todo_list":
      return [
        {
          event: "todo_list",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            item_id: threadEventItem.id,
            items: threadEventItem.items
          }
        }
      ];

    case "error":
      return [
        {
          event: "error",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            item_id: threadEventItem.id,
            message: threadEventItem.message
          }
        }
      ];

    default:
      return [
        {
          event: "runtime_item",
          data: {
            thread_id: context.threadId,
            run_id: context.runId,
            item: threadEventItem
          }
        }
      ];
  }
}
