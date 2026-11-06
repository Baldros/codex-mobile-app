import type { RunInputItem, UploadedAttachment } from "./bridge";

export function attachmentInputItems(attachments: UploadedAttachment[]): RunInputItem[] {
  return attachments.map((attachment) => ({ type: "attachment", id: attachment.id, name: attachment.name }));
}

export function messageForDraft(draft: string, count: number) {
  if (draft.trim() || count === 0) return draft;
  return count === 1 ? "Please review the attached file." : "Please review the attached files.";
}
