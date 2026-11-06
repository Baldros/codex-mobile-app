import type { ChatMessage } from "./bridge";

export function reconcileTranscriptMessages(history: ChatMessage[], current: ChatMessage[], activeRunId: string | null) {
  if (!activeRunId) return history;
  const live = current.filter((message) => message.turnId === activeRunId);
  if (live.length === 0) return history;
  return [...history.filter((message) => message.turnId !== activeRunId), ...live];
}
