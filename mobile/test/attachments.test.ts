import { attachmentInputItems, messageForDraft } from "../src/domain/attachments";

test("builds opaque attachment references and a file-only prompt", () => {
  const items = attachmentInputItems([{ id: "upload_1", name: "notes.txt", size: 3, kind: "file", created_at: "" }]);
  expect(items).toEqual([{ type: "attachment", id: "upload_1", name: "notes.txt" }]);
  expect(messageForDraft("  ", 1)).toBe("Please review the attached file.");
  expect(messageForDraft("Inspect this", 1)).toBe("Inspect this");
});
