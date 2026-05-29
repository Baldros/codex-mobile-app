import { parseMarkdown } from "../src/utils/markdown";

describe("markdown parser", () => {
  it("parses headings and inline formatting", () => {
    expect(parseMarkdown("# Title\nText with **bold**, *emphasis*, `code`, and [link](https://example.com).")).toEqual([
      {
        type: "heading",
        level: 1,
        children: [{ type: "text", text: "Title" }]
      },
      {
        type: "paragraph",
        children: [
          { type: "text", text: "Text with " },
          { type: "strong", children: [{ type: "text", text: "bold" }] },
          { type: "text", text: ", " },
          { type: "emphasis", children: [{ type: "text", text: "emphasis" }] },
          { type: "text", text: ", " },
          { type: "code", text: "code" },
          { type: "text", text: ", and " },
          { type: "link", href: "https://example.com", children: [{ type: "text", text: "link" }] },
          { type: "text", text: "." }
        ]
      }
    ]);
  });

  it("parses lists and fenced code blocks", () => {
    expect(parseMarkdown("- First\n- Second\n\n```ts\nconst ok = true;\n```")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", text: "First" }],
          [{ type: "text", text: "Second" }]
        ]
      },
      {
        type: "code",
        language: "ts",
        text: "const ok = true;"
      }
    ]);
  });
});
