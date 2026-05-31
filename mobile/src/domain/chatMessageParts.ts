// Builders and reducers for the structured parts of a ChatMessage. Each function
// is pure: it returns a new ChatMessage (or part list) instead of mutating the
// argument, so callers can use them directly inside React state updates.

import { createId, trimMiddle } from "../utils/value";
import type { ActivityItem, ChatMessage, ChatMessagePart, PendingApproval } from "./bridge";

export function textPartId(itemId: string) {
  return `text_${itemId}`;
}

export function activityPartId(activityId: string) {
  return `activity_${activityId}`;
}

export function approvalPartId(approvalId: string) {
  return `approval_${approvalId}`;
}

export function ensureMessageParts(message: ChatMessage): ChatMessagePart[] {
  if (message.parts) {
    return [...message.parts];
  }
  if (message.text.trim()) {
    return [
      {
        id: `${message.id}_text`,
        type: "text",
        text: message.text,
        ...(message.pending !== undefined ? { pending: message.pending } : {})
      }
    ];
  }
  return [];
}

export function messageTextFromParts(parts: ChatMessagePart[]) {
  return parts
    .filter((part): part is Extract<ChatMessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .filter((text) => text.trim().length > 0)
    .join("\n\n");
}

export function completePendingParts(parts: ChatMessagePart[] | undefined) {
  return (parts ?? []).map((part): ChatMessagePart =>
    part.type === "text" ? { ...part, pending: false } : part
  );
}

export function appendTextPart(message: ChatMessage, text: string, itemId?: string | null): ChatMessage {
  const parts = ensureMessageParts(message);
  const partId = itemId ? textPartId(itemId) : null;
  const existingIndex = partId
    ? parts.findIndex((part) => part.id === partId && part.type === "text")
    : -1;

  if (existingIndex >= 0) {
    const existing = parts[existingIndex];
    if (existing?.type === "text") {
      parts[existingIndex] = {
        ...existing,
        text: `${existing.text}${text}`,
        pending: true
      };
    }
  } else {
    const last = parts[parts.length - 1];
    if (!partId && last?.type === "text" && last.pending !== false) {
      parts[parts.length - 1] = {
        ...last,
        text: `${last.text}${text}`,
        pending: true
      };
    } else {
      parts.push({
        id: partId ?? createId("text"),
        type: "text",
        text,
        pending: true
      });
    }
  }

  return {
    ...message,
    text: messageTextFromParts(parts),
    parts
  };
}

export function completeTextPart(message: ChatMessage, text?: string | null, itemId?: string | null): ChatMessage {
  const cleanText = text ?? "";
  const parts = ensureMessageParts(message);
  const partId = itemId ? textPartId(itemId) : null;
  const existingIndex = partId
    ? parts.findIndex((part) => part.id === partId && part.type === "text")
    : -1;

  if (existingIndex >= 0) {
    const existing = parts[existingIndex];
    if (existing?.type === "text") {
      parts[existingIndex] = {
        ...existing,
        text: cleanText.length > 0 ? cleanText : existing.text,
        pending: false
      };
    }
  } else {
    const lastIndex = parts.length - 1;
    const existing = parts[lastIndex];
    if (!partId && existing?.type === "text") {
      parts[lastIndex] = {
        ...existing,
        text: cleanText.length > 0 ? cleanText : existing.text,
        pending: false
      };
    } else if (cleanText.length > 0) {
      parts.push({
        id: partId ?? createId("text"),
        type: "text",
        text: cleanText,
        pending: false
      });
    }
  }

  return {
    ...message,
    text: messageTextFromParts(parts),
    parts
  };
}

export function upsertActivityPart(message: ChatMessage, activity: ActivityItem): ChatMessage {
  const parts = ensureMessageParts(message);
  const partId = activityPartId(activity.id);
  const existingIndex = parts.findIndex((part) => part.id === partId && part.type === "activity");
  const existing = existingIndex >= 0 ? parts[existingIndex] : undefined;
  const nextPart: Extract<ChatMessagePart, { type: "activity" }> = {
    id: partId,
    type: "activity",
    title: activity.title,
    detail: activity.detail,
    status: activity.status,
    output: existing?.type === "activity" ? existing.output : undefined
  };

  if (existingIndex >= 0) {
    parts[existingIndex] = nextPart;
  } else {
    parts.push(nextPart);
  }

  return { ...message, parts };
}

export function appendActivityOutputPart(
  message: ChatMessage,
  activityId: string,
  output: string,
  fallbackDetail?: string
): ChatMessage {
  const parts = ensureMessageParts(message);
  const partId = activityPartId(activityId);
  const existingIndex = parts.findIndex((part) => part.id === partId && part.type === "activity");

  if (existingIndex >= 0) {
    const existing = parts[existingIndex];
    if (existing?.type === "activity") {
      const nextOutput = `${existing.output ?? ""}${output}`;
      parts[existingIndex] = {
        ...existing,
        detail: fallbackDetail ?? existing.detail,
        output: trimMiddle(nextOutput, 360),
        status: existing.status === "done" || existing.status === "failed" ? existing.status : "running"
      };
    }
  } else {
    parts.push({
      id: partId,
      type: "activity",
      title: "Command output",
      detail: fallbackDetail,
      output: trimMiddle(output, 360),
      status: "running"
    });
  }

  return { ...message, parts };
}

export function upsertApprovalPart(message: ChatMessage, approval: PendingApproval): ChatMessage {
  const parts = ensureMessageParts(message);
  const partId = approvalPartId(approval.approval_id);
  const existingIndex = parts.findIndex((part) => part.id === partId && part.type === "approval");

  const nextPart = {
    id: partId,
    type: "approval" as const,
    approval,
    status: "pending" as const
  };

  if (existingIndex >= 0) {
    parts[existingIndex] = nextPart;
  } else {
    parts.push(nextPart);
  }

  return { ...message, parts };
}

export function answerApprovalPart(message: ChatMessage, approvalId: string, decision: string): ChatMessage {
  const parts = ensureMessageParts(message).map((part): ChatMessagePart => {
    if (part.type !== "approval" || part.approval.approval_id !== approvalId) {
      return part;
    }
    return {
      ...part,
      status: "answered",
      decision
    };
  });
  return { ...message, parts };
}

export function failAssistantMessage(message: ChatMessage, error: string): ChatMessage {
  const parts = ensureMessageParts(message);
  if (parts.length === 0) {
    parts.push({
      id: createId("text"),
      type: "text",
      text: error,
      pending: false
    });
  }
  return {
    ...message,
    text: message.text || error,
    pending: false,
    parts: completePendingParts(parts)
  };
}
