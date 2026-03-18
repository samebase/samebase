import { describe, expect, it } from "vitest";

import {
  prosemarkMergeViewConfigsEqual,
  resolveProsemarkMergeViewConfig,
} from "@/lib/prosemarkMergeViewConfig";

const NO_INLINE_DIFFS = false;
const SYNTAX_HIGHLIGHT_DELETIONS = true;

describe("resolveProsemarkMergeViewConfig", () => {
  it("keeps append-only EOF normalization stable across appended edits", () => {
    const baseValue = `# Links

- https://x.com/matteocollina/status/2033590124919787819`;
    const initialAppend = `${baseValue}
- https://tree.md/`;
    const extendedAppend = `${initialAppend}
- https://example.com/`;

    const initialConfig = resolveProsemarkMergeViewConfig(
      initialAppend,
      baseValue,
      NO_INLINE_DIFFS,
      SYNTAX_HIGHLIGHT_DELETIONS,
    );
    const extendedConfig = resolveProsemarkMergeViewConfig(
      extendedAppend,
      baseValue,
      NO_INLINE_DIFFS,
      SYNTAX_HIGHLIGHT_DELETIONS,
    );

    expect(prosemarkMergeViewConfigsEqual(initialConfig, extendedConfig)).toBe(
      true,
    );
  });

  it("keeps trailing-newline-only edits visible", () => {
    const baseValue = `# Links

- https://x.com/matteocollina/status/2033590124919787819`;
    const config = resolveProsemarkMergeViewConfig(
      `${baseValue}\n`,
      baseValue,
      NO_INLINE_DIFFS,
      SYNTAX_HIGHLIGHT_DELETIONS,
    );

    expect(config.hideSyntheticTrailingNewlineDeletion).toBe(false);
    expect(config.original).toBe(baseValue);
  });

  it("reconfigures when the edit stops being append-only", () => {
    const baseValue = `# Links

- https://x.com/matteocollina/status/2033590124919787819`;
    const appendOnlyValue = `${baseValue}
- https://tree.md/`;
    const editedExistingLine = `# Links

- https://x.com/matteocollina/status/2033590124919787810`;

    const appendOnlyConfig = resolveProsemarkMergeViewConfig(
      appendOnlyValue,
      baseValue,
      NO_INLINE_DIFFS,
      SYNTAX_HIGHLIGHT_DELETIONS,
    );
    const editedExistingLineConfig = resolveProsemarkMergeViewConfig(
      editedExistingLine,
      baseValue,
      NO_INLINE_DIFFS,
      SYNTAX_HIGHLIGHT_DELETIONS,
    );

    expect(
      prosemarkMergeViewConfigsEqual(
        appendOnlyConfig,
        editedExistingLineConfig,
      ),
    ).toBe(false);
  });
});
