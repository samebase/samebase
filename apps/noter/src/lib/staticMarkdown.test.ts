import { describe, expect, it } from "vitest";

import {
  parseStaticMarkdown,
  parseStaticMarkdownInline,
} from "./staticMarkdown";

describe("parseStaticMarkdownInline", () => {
  it("parses text and inline code in sequence", () => {
    expect(
      parseStaticMarkdownInline(
        "Cookie named `sidebar_state` and [privacy page](/privacy).",
      ),
    ).toEqual([
      {
        type: "text",
        value: "Cookie named ",
      },
      {
        type: "code",
        value: "sidebar_state",
      },
      {
        type: "text",
        value: " and [privacy page](/privacy).",
      },
    ]);
  });
});

describe("parseStaticMarkdown", () => {
  it("parses headings, paragraphs, and wrapped list items", () => {
    expect(
      parseStaticMarkdown(`# Privacy Policy

Intro line one
continues here.

- First bullet
  with continuation
- Second bullet

## Details

More text.`),
    ).toEqual([
      {
        type: "heading",
        level: 1,
        content: [
          {
            type: "text",
            value: "Privacy Policy",
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            value: "Intro line one continues here.",
          },
        ],
      },
      {
        type: "list",
        items: [
          [
            {
              type: "text",
              value: "First bullet with continuation",
            },
          ],
          [
            {
              type: "text",
              value: "Second bullet",
            },
          ],
        ],
      },
      {
        type: "heading",
        level: 2,
        content: [
          {
            type: "text",
            value: "Details",
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            value: "More text.",
          },
        ],
      },
    ]);
  });
});
