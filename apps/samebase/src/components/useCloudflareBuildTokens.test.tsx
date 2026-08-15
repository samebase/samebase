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
  tokens,
}: {
  error?: boolean;
  initialUuid: string | null;
  isFetching: boolean;
  tokens: readonly Token[] | null;
}) {
  latestSelection = useCloudflareBuildTokenSelection({
    error,
    initialUuid,
    isFetching,
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

  it("does not silently replace a selected token that leaves the list", () => {
    renderSelection({
      initialUuid: "token-a",
      isFetching: false,
      tokens: [{ uuid: "token-a" }],
    });
    expect(readSelection().selectedUuid).toBe("token-a");

    renderSelection({
      initialUuid: "token-a",
      isFetching: false,
      tokens: [{ uuid: "token-b" }],
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
