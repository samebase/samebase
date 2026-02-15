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
});
