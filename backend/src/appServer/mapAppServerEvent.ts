import type { AppServerNotification, AppServerRequest } from "./AppServerClient.js";
import type { BridgeSseEvent } from "../sse.js";

export type AppServerRunContext = {
  bridgeThreadId: string;
  turnId: string;
};

export function mapAppServerNotification(
  message: AppServerNotification,
  context: AppServerRunContext
): BridgeSseEvent[] {
  const params = asRecord(message.params);
  const threadId = String(params.threadId ?? context.bridgeThreadId);
  const turnId = String(params.turnId ?? context.turnId);

  switch (message.method) {
    case "item/agentMessage/delta":
      return [
        {
          event: "agent_message_delta",
          data: {
            thread_id: threadId,
            run_id: turnId,
            item_id: params.itemId,
            text: params.delta
          }
        }
      ];

    case "item/reasoning/summaryTextDelta":
    case "item/reasoning/textDelta":
      return [
        {
          event: "reasoning_summary",
          data: {
            thread_id: threadId,
            run_id: turnId,
            item_id: params.itemId,
            text: params.delta
          }
        }
      ];

    case "item/commandExecution/outputDelta":
      return [
        {
          event: "command_output",
          data: {
            thread_id: threadId,
            run_id: turnId,
            item_id: params.itemId,
            output: params.delta
          }
        }
      ];

    case "item/fileChange/outputDelta":
      return [
        {
          event: "file_change",
          data: {
            thread_id: threadId,
            run_id: turnId,
            item_id: params.itemId,
            output: params.delta
          }
        }
      ];

    case "item/started":
      return mapAppServerItem("started", asRecord(params.item), threadId, turnId);

    case "item/completed":
      return mapAppServerItem("completed", asRecord(params.item), threadId, turnId);

    case "turn/plan/updated":
      return [
        {
          event: "todo_list",
          data: {
            thread_id: threadId,
            run_id: turnId,
            items: params.plan
          }
        }
      ];

    case "turn/completed": {
      const turn = asRecord(params.turn);
      return [
        {
          event: "done",
          data: {
            thread_id: threadId,
            run_id: String(turn.id ?? turnId),
            status: turn.status ?? "completed",
            error: turn.error ?? null
          }
        }
      ];
    }

    case "error":
      return [
        {
          event: "error",
          data: {
            thread_id: threadId,
            run_id: turnId,
            message: params.message ?? "App-server error."
          }
        }
      ];

    default:
      return [];
  }
}

export function mapAppServerRequest(message: AppServerRequest): BridgeSseEvent {
  const params = asRecord(message.params);
  const type = approvalTypeForMethod(message.method);

  return {
    event: "approval_requested",
    data: {
      approval_id: String(message.id),
      approval_type: type,
      method: message.method,
      thread_id: params.threadId,
      run_id: params.turnId,
      item_id: params.itemId,
      reason: params.reason ?? null,
      command: params.command ?? null,
      cwd: params.cwd ?? null,
      grant_root: params.grantRoot ?? null,
      command_actions: params.commandActions ?? null,
      network_approval_context: params.networkApprovalContext ?? null,
      available_decisions: decisionsForApprovalType(type)
    }
  };
}

export function messageBelongsToThread(message: AppServerNotification | AppServerRequest, threadId: string) {
  const params = asRecord(message.params);
  return params.threadId === undefined || params.threadId === threadId;
}

function mapAppServerItem(
  state: "started" | "completed",
  item: Record<string, unknown>,
  threadId: string,
  turnId: string
): BridgeSseEvent[] {
  switch (item.type) {
    case "agentMessage":
      return [
        {
          event: state === "completed" ? "agent_message" : "agent_message_delta",
          data: {
            thread_id: threadId,
            run_id: turnId,
            item_id: item.id,
            text: item.text ?? ""
          }
        }
      ];

    case "reasoning":
      return [
        {
          event: "reasoning_summary",
          data: {
            thread_id: threadId,
            run_id: turnId,
            item_id: item.id,
            summary: item.summary,
            content: item.content
          }
        }
      ];

    case "commandExecution":
      if (state === "started") {
        return [
          {
            event: "tool_start",
            data: {
              thread_id: threadId,
              run_id: turnId,
              item_id: item.id,
              kind: "command_execution",
              command: item.command,
              cwd: item.cwd
            }
          }
        ];
      }

      return [
        {
          event: "tool_end",
          data: {
            thread_id: threadId,
            run_id: turnId,
            item_id: item.id,
            kind: "command_execution",
            command: item.command,
            cwd: item.cwd,
            output: item.aggregatedOutput,
            exit_code: item.exitCode,
            status: item.status,
            duration_ms: item.durationMs
          }
        }
      ];

    case "fileChange":
      return [
        {
          event: "file_change",
          data: {
            thread_id: threadId,
            run_id: turnId,
            item_id: item.id,
            changes: item.changes,
            status: item.status
          }
        }
      ];

    case "mcpToolCall":
    case "dynamicToolCall":
    case "webSearch":
      return [
        {
          event: state === "started" ? "tool_start" : "tool_end",
          data: {
            thread_id: threadId,
            run_id: turnId,
            item_id: item.id,
            kind: item.type,
            tool: item.tool,
            server: item.server,
            query: item.query,
            status: item.status,
            error: item.error
          }
        }
      ];

    default:
      return [
        {
          event: "runtime_item",
          data: {
            thread_id: threadId,
            run_id: turnId,
            item,
            state
          }
        }
      ];
  }
}

function approvalTypeForMethod(method: string) {
  if (method === "item/commandExecution/requestApproval") {
    return "command_execution";
  }
  if (method === "item/fileChange/requestApproval") {
    return "file_change";
  }
  if (method === "item/permissions/requestApproval") {
    return "permissions";
  }
  if (method === "item/tool/requestUserInput") {
    return "user_input";
  }
  return "server_request";
}

function decisionsForApprovalType(type: string) {
  if (type === "command_execution" || type === "file_change") {
    return ["accept", "acceptForSession", "decline", "cancel"];
  }
  return ["accept", "decline", "cancel"];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
