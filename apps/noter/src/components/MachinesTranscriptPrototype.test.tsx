// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  MachinesTranscriptPrototype,
  type MachinesTranscriptPrototypeBlock,
} from "@/components/MachinesTranscriptPrototype";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const FIXTURE_BLOCKS = [
  {
    kind: "message",
    id: "message-1",
    from: "user",
    body: "Selection should activate the source-shaped transcript state.",
  },
  {
    kind: "message",
    id: "message-2",
    from: "assistant",
    body: "Clearing the selection should restore the rendered overlay.",
  },
] as const satisfies readonly MachinesTranscriptPrototypeBlock[];

describe("MachinesTranscriptPrototype", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root !== null) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }

    rootElement?.remove();
    rootElement = null;
    window.getSelection()?.removeAllRanges();
  });

  function renderPrototype() {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <MachinesTranscriptPrototype
          blocks={FIXTURE_BLOCKS}
          dataTestId="machines-transcript-prototype"
        />,
      );
    });

    const transcript = rootElement.querySelector(
      '[data-testid="machines-transcript-prototype"]',
    );
    expect(transcript).not.toBeNull();
    if (!(transcript instanceof HTMLDivElement)) {
      throw new Error("Expected transcript root");
    }

    return transcript;
  }

  it("reveals source mode when selection exists inside the transcript", () => {
    const transcript = renderPrototype();
    const sourceParagraph = transcript.querySelector(
      "[data-transcript-source-body]",
    );
    expect(sourceParagraph).not.toBeNull();
    if (sourceParagraph === null) {
      throw new Error("Expected transcript source paragraph");
    }

    expect(transcript.dataset.selectionActive).toBe("false");

    const selection = window.getSelection();
    expect(selection).not.toBeNull();
    if (selection === null) {
      throw new Error("Expected DOM selection support");
    }

    const range = document.createRange();
    range.selectNodeContents(sourceParagraph);

    act(() => {
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });

    expect(transcript.dataset.selectionActive).toBe("true");

    act(() => {
      selection.removeAllRanges();
      document.dispatchEvent(new Event("selectionchange"));
    });

    expect(transcript.dataset.selectionActive).toBe("false");
  });
});
