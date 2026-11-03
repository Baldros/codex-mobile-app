import { messageTextFromParts } from "../src/domain/chatMessageParts";

test("copies text and code in order without tool or approval UI", () => {
  expect(messageTextFromParts([
    { id: "a", type: "text", text: "# Heading\n\nProse" },
    { id: "tool", type: "activity", title: "Command", status: "done", output: "secret tool output" },
    { id: "b", type: "text", text: "```ts\nconst x = 1;\n```" }
  ])).toBe("# Heading\n\nProse\n\n```ts\nconst x = 1;\n```");
});
