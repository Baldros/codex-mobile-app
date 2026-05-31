// Parses a persisted Codex thread (its raw turns/items, whose shape varies across
// runtimes) into the app's ChatMessage[] model. Everything here is read-only
// mapping of untyped payloads, so it leans on the value coercers in utils/value.

import {
  arrayValue,
  asRecord,
  asString,
  firstText,
  lowerString,
  optionalText,
  stringifyPayload,
  textEntries
} from "../utils/value";
import { activityPartId, messageTextFromParts } from "./chatMessageParts";
import type { ActivityItem, BridgeThread, ChatMessage, ChatMessagePart } from "./bridge";

export function messagesFromThread(thread: BridgeThread) {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const messages: ChatMessage[] = [];

  turns.forEach((turn, turnIndex) => {
    const record = asRecord(turn);
    if (!record) {
      return;
    }
    const turnId = asString(record.id) ?? asString(record.turnId) ?? `turn_${turnIndex}`;

    for (const text of textEntries(record.input ?? record.userInput ?? record.prompt)) {
      messages.push({
        id: historyId("history_user", turnId, messages.length),
        role: "user",
        text
      });
    }

    const items = turnItems(record);
    const toolResultsByCallId = collectToolResults(items);
    const assistantParts: ChatMessagePart[] = [];

    items.forEach((item, itemIndex) => {
      const itemRecord = asRecord(item);
      if (!itemRecord) {
        return;
      }

      const role = lowerString(itemRecord.role);
      const type = lowerString(itemRecord.type);
      const text = firstText(itemRecord.text, itemRecord.content, itemRecord.message);

      if (role === "user" || role === "human" || type === "usermessage" || type === "user_message") {
        if (text) {
          messages.push({
            id: historyId("history_user", turnId, itemIndex),
            role: "user",
            text
          });
        }
        return;
      }

      if (
        role === "assistant" ||
        role === "ai" ||
        role === "model" ||
        type === "agentmessage" ||
        type === "agent_message" ||
        type === "assistantmessage" ||
        type === "assistant_message"
      ) {
        if (text) {
          assistantParts.push({
            id: historyId("history_text", turnId, itemIndex),
            type: "text",
            text,
            pending: false
          });
        }
        for (const part of toolCallParts(itemRecord, toolResultsByCallId, turnId, itemIndex)) {
          assistantParts.push(part);
        }
        return;
      }

      const activityPart = activityPartFromHistoryItem(itemRecord, toolResultsByCallId, turnId, itemIndex);
      if (activityPart) {
        assistantParts.push(activityPart);
      }
    });

    const assistantText = firstText(
      record.assistantMessage,
      record.response,
      record.outputText,
      record.finalMessage
    );
    if (assistantText && !assistantParts.some((part) => part.type === "text" && part.text === assistantText)) {
      assistantParts.push({
        id: historyId("history_text", turnId, "final"),
        type: "text",
        text: assistantText,
        pending: false
      });
    }

    if (assistantParts.length > 0) {
      messages.push({
        id: historyId("history_assistant", turnId, messages.length),
        role: "assistant",
        text: messageTextFromParts(assistantParts),
        parts: assistantParts,
        pending: false
      });
    }
  });

  return messages;
}

function turnItems(turn: Record<string, unknown>) {
  return arrayValue(
    turn.items ??
      turn.output ??
      turn.responses ??
      turn.messages ??
      turn.events ??
      turn.steps
  );
}

function collectToolResults(items: unknown[]) {
  const results = new Map<string, string>();

  for (const item of items) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const role = lowerString(record.role);
    const type = lowerString(record.type);
    const callId = asString(record.tool_call_id) ?? asString(record.toolCallId) ?? asString(record.call_id);
    if (!callId || (role !== "tool" && type !== "tool" && type !== "tool_result" && type !== "toolresult")) {
      continue;
    }

    const output = firstText(record.content, record.output, record.result, record.text);
    if (output) {
      results.set(callId, output);
    }
  }

  return results;
}

function toolCallParts(
  item: Record<string, unknown>,
  toolResultsByCallId: Map<string, string>,
  turnId: string,
  itemIndex: number
): ChatMessagePart[] {
  const toolCalls = arrayValue(item.tool_calls ?? item.toolCalls);
  return toolCalls.flatMap((toolCall, toolIndex): ChatMessagePart[] => {
    const record = asRecord(toolCall);
    if (!record) {
      return [];
    }

    const id = asString(record.id) ?? asString(record.call_id) ?? historyId("tool_call", turnId, `${itemIndex}_${toolIndex}`);
    const args = stringifyPayload(record.args ?? record.arguments ?? record.input);
    return [
      {
        id: activityPartId(id),
        type: "activity",
        title: asString(record.name) ?? asString(record.tool) ?? "Tool call",
        detail: args,
        output: toolResultsByCallId.get(id),
        status: "done"
      }
    ];
  });
}

function activityPartFromHistoryItem(
  item: Record<string, unknown>,
  toolResultsByCallId: Map<string, string>,
  turnId: string,
  itemIndex: number
): Extract<ChatMessagePart, { type: "activity" }> | null {
  const role = lowerString(item.role);
  const type = lowerString(item.type);

  if (role === "tool" || type === "tool" || type === "tool_result" || type === "toolresult") {
    const callId = asString(item.tool_call_id) ?? asString(item.toolCallId) ?? asString(item.call_id);
    return {
      id: activityPartId(callId ?? historyId("tool_result", turnId, itemIndex)),
      type: "activity",
      title: asString(item.name) ?? "Tool result",
      detail: optionalText(item.content, item.output, item.result, item.text),
      status: historyStatus(item.status)
    };
  }

  if (type === "reasoning") {
    const detail = firstText(item.summary, item.text, item.content);
    return detail
      ? {
          id: activityPartId(asString(item.id) ?? historyId("reasoning", turnId, itemIndex)),
          type: "activity",
          title: "Reasoning",
          detail,
          status: "info"
        }
      : null;
  }

  if (type === "commandexecution" || type === "command_execution") {
    const id = asString(item.id) ?? historyId("command", turnId, itemIndex);
    return {
      id: activityPartId(id),
      type: "activity",
      title: "Command",
      detail: commandDetail(item.command, item.cwd),
      output: optionalText(item.aggregatedOutput, item.aggregated_output, item.output, item.result),
      status: historyStatus(item.status, item.exitCode ?? item.exit_code)
    };
  }

  if (type === "mcptoolcall" || type === "mcp_tool_call" || type === "dynamictoolcall") {
    const id = asString(item.id) ?? historyId("mcp", turnId, itemIndex);
    return {
      id: activityPartId(id),
      type: "activity",
      title: asString(item.tool) ?? "MCP tool",
      detail: asString(item.server) ?? stringifyPayload(item.input ?? item.args),
      output: optionalText(item.output, item.result, item.error),
      status: historyStatus(item.status, item.error ? 1 : undefined)
    };
  }

  if (type === "websearch" || type === "web_search") {
    const id = asString(item.id) ?? historyId("web", turnId, itemIndex);
    return {
      id: activityPartId(id),
      type: "activity",
      title: "Web search",
      detail: asString(item.query) ?? optionalText(item.input),
      output: optionalText(item.output, item.result),
      status: historyStatus(item.status)
    };
  }

  if (type === "filechange" || type === "file_change") {
    const id = asString(item.id) ?? historyId("file", turnId, itemIndex);
    return {
      id: activityPartId(id),
      type: "activity",
      title: "File change",
      detail: asString(item.status) ?? stringifyPayload(item.changes),
      output: optionalText(item.output, item.result),
      status: historyStatus(item.status)
    };
  }

  if (type === "todo_list" || type === "todolist") {
    const id = asString(item.id) ?? historyId("todo", turnId, itemIndex);
    return {
      id: activityPartId(id),
      type: "activity",
      title: "Plan updated",
      detail: "Task list changed",
      status: "info"
    };
  }

  const result = toolResultsByCallId.get(asString(item.id) ?? "");
  return result
    ? {
        id: activityPartId(asString(item.id) ?? historyId("tool", turnId, itemIndex)),
        type: "activity",
        title: asString(item.name) ?? "Tool result",
        detail: result,
        status: "done"
      }
    : null;
}

function historyStatus(status: unknown, exitCode?: unknown): ActivityItem["status"] {
  const normalized = lowerString(status);
  if (
    normalized === "failed" ||
    normalized === "error" ||
    normalized === "errored" ||
    (typeof exitCode === "number" && exitCode !== 0)
  ) {
    return "failed";
  }
  if (normalized === "running" || normalized === "in_progress" || normalized === "pending") {
    return "running";
  }
  if (normalized === "info") {
    return "info";
  }
  return "done";
}

function commandDetail(command: unknown, cwd: unknown) {
  if (Array.isArray(command)) {
    return command.map((part) => String(part)).join(" ");
  }
  if (typeof command === "string" && command.length > 0) {
    return command;
  }
  return typeof cwd === "string" ? cwd : undefined;
}

function historyId(prefix: string, turnId: string, suffix: string | number) {
  return `${prefix}_${turnId}_${suffix}`;
}
