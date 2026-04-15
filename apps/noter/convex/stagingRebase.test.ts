import { describe, it, expect } from "vitest";
import { rebaseStagedContent } from "./stagingRebase";

describe("rebaseStagedContent", () => {
  it("applies a non-conflicting patch on top of upstream", () => {
    const baseContent = "A\nB\nC\n";
    const stagedContent = "A\nB\nC\nD\n";
    const upstreamContent = "A\nB\nX\nC\n";

    const result = rebaseStagedContent({
      baseContent,
      stagedContent,
      upstreamContent,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.content).toBe("A\nB\nX\nC\nD\n");
  });

  it("returns conflict markers when patch cannot be applied", () => {
    const baseContent = "A\nB\nC\n";
    const stagedContent = "A\nB\nours\n";
    const upstreamContent = "A\nB\ntheirs\n";

    const result = rebaseStagedContent({
      baseContent,
      stagedContent,
      upstreamContent,
    });

    expect(result.hasConflict).toBe(true);
    expect(result.content).toContain("<<<<<<< noter");
    expect(result.content).toContain("=======");
    expect(result.content).toContain(">>>>>>> main");
    expect(result.content).toContain("ours");
    expect(result.content).toContain("theirs");
  });

  it("returns upstream content when staged matches upstream", () => {
    const baseContent = "A\n";
    const stagedContent = "A\nB\n";
    const upstreamContent = "A\nB\n";

    const result = rebaseStagedContent({
      baseContent,
      stagedContent,
      upstreamContent,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.content).toBe(upstreamContent);
  });

  it("merges insertion-only edits when upstream inserted nearby lines", () => {
    const baseContent = [
      "# TODO",
      "",
      "- light panda",
      "- if given enough instruction",
      "",
      "## Companies to Research",
      "- AFFiNE",
      "- shadcn-editor",
      "",
      "# Important",
      "",
      "- add better rebase",
      "- We need less",
      "",
    ].join("\n");
    const stagedContent = [
      "# TODO",
      "",
      "- light panda",
      "- if given enough instruction",
      "",
      "## Companies to Research",
      "- AFFiNE",
      "- shadcn-editor",
      "- void.cloud",
      "",
      "# Important",
      "",
      "- add better rebase",
      "- We need less",
      "",
    ].join("\n");
    const upstreamContent = [
      "# TODO",
      "",
      "- light panda",
      "- review Observable notebooks docs",
      "- if given enough instruction",
      "",
      "## Companies to Research",
      "- AFFiNE",
      "- shadcn-editor",
      "- Tuple",
      "",
      "# Important",
      "",
      "- add better rebase",
      "- bootstrap pnpm anon non-interactive",
      "- We need less",
      "",
    ].join("\n");

    const result = rebaseStagedContent({
      baseContent,
      stagedContent,
      upstreamContent,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.content).toContain("- void.cloud\n- Tuple");
    expect(result.content).toContain("- review Observable notebooks docs");
    expect(result.content).toContain("- bootstrap pnpm anon non-interactive");
  });

  it("returns a conflict when repeated context makes insertion placement ambiguous", () => {
    const result = rebaseStagedContent({
      baseContent: "A\nA\nA\nA\n",
      stagedContent: "A\nA\nA\nA\nB\n",
      upstreamContent: "A\nA\nA\nB\n",
    });

    expect(result.hasConflict).toBe(true);
    expect(result.content).toContain("<<<<<<< noter");
  });
});
