// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { useCloudflareBuildTokenSelection } from "./useCloudflareBuildTokens";

type Selection = ReturnType<typeof useCloudflareBuildTokenSelection>;
type Token = { uuid: string };

let latestSelection: Selection | null = null;
let root: Root | null = null;

function SelectionProbe({
  error = false,
  initialUuid,
  isFetching,
  lastUsedUuid = null,
  tokens,
}: {
  error?: boolean;
  initialUuid: string | null;
  isFetching: boolean;
  lastUsedUuid?: string | null;
  tokens: readonly Token[] | null;
}) {
  latestSelection = useCloudflareBuildTokenSelection({
    error,
    initialUuid,
    isFetching,
    lastUsedUuid,
    tokens,
  });
  return null;
}

function readSelection(): Selection {
  if (latestSelection === null) {
    throw new Error("Expected token selection state.");
  }
  return latestSelection;
}

function renderSelection(props: {
  error?: boolean;
  initialUuid: string | null;
  isFetching: boolean;
  lastUsedUuid?: string | null;
  tokens: readonly Token[] | null;
}) {
  if (root === null) {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  }
  act(() => {
    root?.render(<SelectionProbe {...props} />);
  });
}

afterEach(() => {
  if (root !== null) {
    act(() => {
      root?.unmount();
    });
  }
  root = null;
  latestSelection = null;
  document.body.replaceChildren();
});

describe("useCloudflareBuildTokenSelection", () => {
  it("selects the first token after an empty list gains a token", () => {
    renderSelection({ initialUuid: null, isFetching: true, tokens: null });
    expect(readSelection().selectedUuid).toBe("");

    renderSelection({ initialUuid: null, isFetching: false, tokens: [] });
    expect(readSelection().selectedUuid).toBe("");

    renderSelection({
      initialUuid: null,
      isFetching: false,
      tokens: [{ uuid: "token-a" }, { uuid: "token-b" }],
    });
    expect(readSelection()).toMatchObject({
      selectedUuid: "token-a",
      selectionUnavailable: false,
    });
  });

  it("selects the available last-used token before the first-token fallback", () => {
    renderSelection({
      initialUuid: null,
      isFetching: false,
      lastUsedUuid: "token-b",
      tokens: [{ uuid: "token-a" }, { uuid: "token-b" }],
    });
    expect(readSelection()).toMatchObject({
      selectedUuid: "token-b",
      selectionUnavailable: false,
    });
  });

  it("keeps the repair token ahead of the last-used token", () => {
    renderSelection({
      initialUuid: "token-a",
      isFetching: false,
      lastUsedUuid: "token-b",
      tokens: [{ uuid: "token-a" }, { uuid: "token-b" }],
    });
    expect(readSelection()).toMatchObject({
      selectedUuid: "token-a",
      selectionUnavailable: false,
    });
  });

  it("falls back cleanly when the saved last-used token is unavailable", () => {
    renderSelection({
      initialUuid: null,
      isFetching: false,
      lastUsedUuid: "token-missing",
      tokens: [{ uuid: "token-a" }, { uuid: "token-b" }],
    });
    expect(readSelection()).toMatchObject({
      selectedUuid: "token-a",
      selectionUnavailable: false,
    });

    renderSelection({
      initialUuid: null,
      isFetching: false,
      lastUsedUuid: "token-a",
      tokens: [{ uuid: "token-b" }],
    });
    expect(readSelection()).toMatchObject({
      selectedUuid: "token-b",
      selectionUnavailable: false,
    });
  });

  it("keeps an explicit choice when the list order changes", () => {
    const tokens = [{ uuid: "token-a" }, { uuid: "token-b" }];
    renderSelection({ initialUuid: null, isFetching: false, tokens });
    expect(readSelection()).toMatchObject({
      selectedUuid: "token-a",
      selectionUnavailable: false,
    });

    act(() => {
      readSelection().setRequestedUuid("token-b");
    });
    renderSelection({
      initialUuid: null,
      isFetching: false,
      tokens: [{ uuid: "token-new" }, ...tokens],
    });
    expect(readSelection()).toMatchObject({
      selectedUuid: "token-b",
      selectionUnavailable: false,
    });
  });

  it("does not silently replace an explicit choice that leaves the list", () => {
    renderSelection({
      initialUuid: null,
      isFetching: false,
      tokens: [{ uuid: "token-a" }, { uuid: "token-b" }],
    });
    expect(readSelection().selectedUuid).toBe("token-a");

    act(() => {
      readSelection().setRequestedUuid("token-b");
    });
    renderSelection({
      initialUuid: null,
      isFetching: false,
      tokens: [{ uuid: "token-a" }],
    });
    expect(readSelection()).toMatchObject({ selectedUuid: "", selectionUnavailable: true });
  });

  it("blocks writes while the current list refreshes or has failed", () => {
    renderSelection({
      initialUuid: "token-a",
      isFetching: false,
      tokens: [{ uuid: "token-a" }],
    });
    expect(readSelection().canWrite).toBe(true);

    renderSelection({
      initialUuid: "token-a",
      isFetching: true,
      tokens: [{ uuid: "token-a" }],
    });
    expect(readSelection().canWrite).toBe(false);

    renderSelection({
      error: true,
      initialUuid: "token-a",
      isFetching: false,
      tokens: [{ uuid: "token-a" }],
    });
    expect(readSelection().canWrite).toBe(false);
  });

  it("does not select cached data from a failed refresh", () => {
    renderSelection({
      error: true,
      initialUuid: null,
      isFetching: false,
      tokens: [{ uuid: "token-a" }],
    });
    expect(readSelection()).toMatchObject({ selectedUuid: "", selectionUnavailable: false });

    renderSelection({
      initialUuid: null,
      isFetching: false,
      tokens: [{ uuid: "token-a" }, { uuid: "token-b" }],
    });
    expect(readSelection()).toMatchObject({
      selectedUuid: "token-a",
      selectionUnavailable: false,
    });
  });
});
