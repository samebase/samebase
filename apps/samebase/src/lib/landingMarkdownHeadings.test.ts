import { describe, expect, it } from "vite-plus/test";
import { getLandingMarkdownHeadings } from "@/lib/landingMarkdownHeadings";

describe("getLandingMarkdownHeadings", () => {
  it("builds stable sidebar links from markdown headings", () => {
    const headings = getLandingMarkdownHeadings(`# Overview

<summary>
## Hidden summary heading
</summary>

## First **Step**

\`\`\`
## Ignored code heading
\`\`\`

## First Step
### Deep link
`);

    expect(headings).toEqual([
      {
        href: "#overview",
        id: "overview",
        line: 1,
        level: 1,
        text: "Overview",
      },
      {
        href: "#first-step",
        id: "first-step",
        line: 7,
        level: 2,
        text: "First Step",
      },
      {
        href: "#first-step-2",
        id: "first-step-2",
        line: 13,
        level: 2,
        text: "First Step",
      },
      {
        href: "#deep-link",
        id: "deep-link",
        line: 14,
        level: 3,
        text: "Deep link",
      },
    ]);
  });
});
