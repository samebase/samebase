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
  it("selects the first settled singleton list once", () => {
    renderSelection({ initialUuid: null, isFetching: true, tokens: null });
    expect(readSelection().selectedUuid).toBe("");

    renderSelection({
      initialUuid: null,
      isFetching: false,
      tokens: [{ uuid: "token-a" }],
    });
    expect(readSelection()).toMatchObject({
      requestedUuid: "token-a",
      selectedUuid: "token-a",
    });
  });

  it("requires an explicit choice when multiple tokens are listed", () => {
    const tokens = [{ uuid: "token-a" }, { uuid: "token-b" }];
    renderSelection({ initialUuid: null, isFetching: false, tokens });
    expect(readSelection()).toMatchObject({ requestedUuid: "", selectedUuid: "" });

    act(() => {
      readSelection().setRequestedUuid("token-b");
    });
    expect(readSelection()).toMatchObject({
      requestedUuid: "token-b",
      selectedUuid: "token-b",
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
    expect(readSelection()).toMatchObject({ requestedUuid: "token-a", selectedUuid: "" });
  });

  it("blocks writes while the current list refreshes or has failed", () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <SelectionProbe initialUuid="token-a" isFetching={false} tokens={[{ uuid: "token-a" }]} />,
      );
    });
    expect(readSelection().canWrite).toBe(true);

    function WriteStateProbe({ error, isFetching }: { error: boolean; isFetching: boolean }) {
      latestSelection = useCloudflareBuildTokenSelection({
        error,
        initialUuid: "token-a",
        isFetching,
        tokens: [{ uuid: "token-a" }],
      });
      return null;
    }

    act(() => {
      root?.render(<WriteStateProbe error={false} isFetching />);
    });
    expect(readSelection().canWrite).toBe(false);

    act(() => {
      root?.render(<WriteStateProbe error isFetching={false} />);
    });
    expect(readSelection().canWrite).toBe(false);
  });

  it("does not select cached data from a failed refresh", () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <SelectionProbe
          error
          initialUuid={null}
          isFetching={false}
          tokens={[{ uuid: "token-a" }]}
        />,
      );
    });
    expect(readSelection()).toMatchObject({ requestedUuid: "", selectedUuid: "" });

    act(() => {
      root?.render(
        <SelectionProbe
          initialUuid={null}
          isFetching={false}
          tokens={[{ uuid: "token-a" }, { uuid: "token-b" }]}
        />,
      );
    });
    expect(readSelection()).toMatchObject({ requestedUuid: "", selectedUuid: "" });
  });
});
