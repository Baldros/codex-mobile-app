export type MarkdownInlineNode =
  | { type: "text"; text: string }
  | { type: "strong"; children: MarkdownInlineNode[] }
  | { type: "emphasis"; children: MarkdownInlineNode[] }
  | { type: "delete"; children: MarkdownInlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: MarkdownInlineNode[] };

export type MarkdownBlock =
  | { type: "paragraph"; children: MarkdownInlineNode[] }
  | { type: "heading"; level: number; children: MarkdownInlineNode[] }
  | { type: "code"; text: string; language?: string }
  | { type: "list"; ordered: boolean; items: MarkdownInlineNode[][] }
  | { type: "quote"; children: MarkdownInlineNode[] }
  | { type: "divider" };

type InlineToken =
  | { type: "code"; start: number; end: number; text: string }
  | { type: "strong"; start: number; end: number; text: string }
  | { type: "emphasis"; start: number; end: number; text: string }
  | { type: "delete"; start: number; end: number; text: string }
  | { type: "link"; start: number; end: number; label: string; href: string };

type ListItemMatch = {
  ordered: boolean;
  text: string;
};

export function parseMarkdown(value: string): MarkdownBlock[] {
  const lines = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```([^\s`]*)?.*$/);
    if (fence) {
      const language = fence[1]?.trim();
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !/^\s*```/.test(lines[index] ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push({
        type: "code",
        text: codeLines.join("\n"),
        ...(language ? { language } : {})
      });
      continue;
    }

    if (isDivider(line)) {
      blocks.push({ type: "divider" });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1]?.length ?? 1,
        children: parseInlineMarkdown(heading[2] ?? "")
      });
      index += 1;
      continue;
    }

    const listItem = matchListItem(line);
    if (listItem) {
      const ordered = listItem.ordered;
      const items: MarkdownInlineNode[][] = [];

      while (index < lines.length) {
        const current = lines[index] ?? "";
        const currentItem = matchListItem(current);
        if (!currentItem || currentItem.ordered !== ordered) {
          break;
        }

        const itemLines = [currentItem.text];
        index += 1;

        while (index < lines.length) {
          const continuation = lines[index] ?? "";
          if (continuation.trim().length === 0 || matchListItem(continuation) || startsBlock(continuation)) {
            break;
          }
          itemLines.push(continuation.trim());
          index += 1;
        }

        items.push(parseInlineMarkdown(itemLines.join("\n")));
      }

      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];

      while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? "")) {
        quoteLines.push((lines[index] ?? "").replace(/^\s*>\s?/, ""));
        index += 1;
      }

      blocks.push({ type: "quote", children: parseInlineMarkdown(quoteLines.join("\n")) });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (current.trim().length === 0) {
        break;
      }
      if (paragraphLines.length > 0 && startsBlock(current)) {
        break;
      }
      paragraphLines.push(current.trimEnd());
      index += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        children: parseInlineMarkdown(paragraphLines.join("\n"))
      });
    }
  }

  return blocks;
}

export function parseInlineMarkdown(value: string): MarkdownInlineNode[] {
  const nodes: MarkdownInlineNode[] = [];
  let index = 0;

  while (index < value.length) {
    const token = nextInlineToken(value, index);
    if (!token) {
      pushText(nodes, value.slice(index));
      break;
    }

    if (token.start > index) {
      pushText(nodes, value.slice(index, token.start));
    }

    if (token.type === "code") {
      nodes.push({ type: "code", text: token.text });
    } else if (token.type === "link") {
      nodes.push({ type: "link", href: token.href, children: parseInlineMarkdown(token.label) });
    } else {
      nodes.push({ type: token.type, children: parseInlineMarkdown(token.text) });
    }

    index = token.end;
  }

  return nodes;
}

function nextInlineToken(value: string, start: number): InlineToken | null {
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (char === "`") {
      const end = value.indexOf("`", index + 1);
      if (end > index + 1) {
        return { type: "code", start: index, end: end + 1, text: value.slice(index + 1, end) };
      }
    }

    if (value.startsWith("**", index) || value.startsWith("__", index)) {
      const marker = value.slice(index, index + 2);
      const end = value.indexOf(marker, index + 2);
      if (end > index + 2) {
        return { type: "strong", start: index, end: end + 2, text: value.slice(index + 2, end) };
      }
    }

    if (value.startsWith("~~", index)) {
      const end = value.indexOf("~~", index + 2);
      if (end > index + 2) {
        return { type: "delete", start: index, end: end + 2, text: value.slice(index + 2, end) };
      }
    }

    if (char === "[") {
      const link = matchLink(value, index);
      if (link) {
        return link;
      }
    }

    if (char === "*" && !value.startsWith("**", index)) {
      const end = value.indexOf("*", index + 1);
      if (end > index + 1) {
        return { type: "emphasis", start: index, end: end + 1, text: value.slice(index + 1, end) };
      }
    }
  }

  return null;
}

function matchLink(value: string, start: number): InlineToken | null {
  const labelEnd = value.indexOf("]", start + 1);
  if (labelEnd <= start + 1 || value[labelEnd + 1] !== "(") {
    return null;
  }

  const hrefEnd = value.indexOf(")", labelEnd + 2);
  if (hrefEnd <= labelEnd + 2) {
    return null;
  }

  const href = value.slice(labelEnd + 2, hrefEnd).trim();
  if (href.length === 0) {
    return null;
  }

  return {
    type: "link",
    start,
    end: hrefEnd + 1,
    label: value.slice(start + 1, labelEnd),
    href
  };
}

function pushText(nodes: MarkdownInlineNode[], text: string) {
  if (text.length > 0) {
    nodes.push({ type: "text", text });
  }
}

function matchListItem(line: string): ListItemMatch | null {
  const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
  if (ordered) {
    return { ordered: true, text: ordered[1] ?? "" };
  }

  const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
  if (unordered) {
    return { ordered: false, text: unordered[1] ?? "" };
  }

  return null;
}

function startsBlock(line: string) {
  return (
    /^\s*```/.test(line) ||
    /^(#{1,6})\s+/.test(line) ||
    isDivider(line) ||
    /^\s*>\s?/.test(line) ||
    matchListItem(line) !== null
  );
}

function isDivider(line: string) {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}
