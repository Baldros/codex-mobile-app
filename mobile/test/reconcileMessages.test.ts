import { reconcileTranscriptMessages } from "../src/domain/reconcileMessages";
import type { ChatMessage } from "../src/domain/bridge";

test("preserves live parts for the active turn and uses history after completion", () => {
  const history: ChatMessage[] = [{ id: "history", turnId: "turn-1", role: "assistant", text: "old" }];
  const live: ChatMessage[] = [{ id: "live", turnId: "turn-1", role: "assistant", text: "old and new", pending: true }];
  expect(reconcileTranscriptMessages(history, live, "turn-1")).toEqual(live);
  expect(reconcileTranscriptMessages(history, live, null)).toEqual(history);
});
