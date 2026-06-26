import { messagesFromThread } from "../src/domain/threadHistory";
import type { BridgeThread } from "../src/domain/bridge";

describe("thread history mapping", () => {
  it("renders persisted context compaction markers as activity", () => {
    const messages = messagesFromThread({
      id: "thr_1",
      title: "Compact test",
      preview: "",
      turns: [
        {
          id: "turn_1",
          items: [
            {
              id: "compact_1",
              type: "contextCompaction"
            }
          ]
        }
      ]
    } as BridgeThread);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.parts?.[0]).toMatchObject({
      type: "activity",
      title: "Conversation compacted",
      status: "done"
    });
  });
});
