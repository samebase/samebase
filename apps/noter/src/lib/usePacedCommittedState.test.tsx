// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { usePacedCommittedState } from "./usePacedCommittedState";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

type TestHookApi = {
  cancelCommit: () => void;
  commitCurrent: () => void;
  commitValue: (value: number) => void;
  debounceValue: (value: number) => void;
  setDraftValue: (value: number) => void;
  value: number;
};

function TestPacedCommittedState({
  commit,
  committed,
  onRender,
  wait,
}: {
  commit: (value: number) => void;
  committed: number;
  onRender: (api: TestHookApi) => void;
  wait: number;
}) {
  const api = usePacedCommittedState({
    committed,
    commit,
    equals: Object.is,
    wait,
  });

  onRender(api);

  return <output>{api.value}</output>;
}

describe("usePacedCommittedState", () => {
  let root: Root | null = null;
  let latestApi: TestHookApi | null = null;

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot !== null) {
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }

    latestApi = null;
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  function getApi(): TestHookApi {
    if (latestApi === null) {
      throw new Error("Expected hook API to be rendered");
    }

    return latestApi;
  }

  function renderPacedState({
    commit,
    committed,
    wait = 100,
  }: {
    commit: (value: number) => void;
    committed: number;
    wait?: number;
  }) {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    const render = (nextCommitted: number) => {
      act(() => {
        localRoot.render(
          <TestPacedCommittedState
            commit={commit}
            committed={nextCommitted}
            onRender={(api) => {
              latestApi = api;
            }}
            wait={wait}
          />,
        );
      });
    };

    render(committed);

    return {
      getValueText: () => rootElement.textContent,
      rerender: render,
    };
  }

  it("shows drafts immediately and debounces the latest commit", () => {
    vi.useFakeTimers();
    const commit = vi.fn<(value: number) => void>();
    const renderedState = renderPacedState({ commit, committed: 1 });

    expect(renderedState.getValueText()).toBe("1");

    act(() => {
      getApi().debounceValue(2);
    });
    expect(renderedState.getValueText()).toBe("2");

    act(() => {
      getApi().debounceValue(3);
    });
    expect(renderedState.getValueText()).toBe("3");
    expect(commit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(commit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenLastCalledWith(3);
  });

  it("commits explicit values immediately and skips no-op commits", () => {
    const commit = vi.fn<(value: number) => void>();
    const renderedState = renderPacedState({ commit, committed: 1 });

    act(() => {
      getApi().commitValue(1);
    });
    expect(commit).not.toHaveBeenCalled();
    expect(renderedState.getValueText()).toBe("1");

    act(() => {
      getApi().commitValue(2);
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenLastCalledWith(2);
    expect(renderedState.getValueText()).toBe("2");
  });

  it("cancels a pending draft when committed state changes externally", () => {
    vi.useFakeTimers();
    const commit = vi.fn<(value: number) => void>();
    const renderedState = renderPacedState({ commit, committed: 1 });

    act(() => {
      getApi().debounceValue(2);
    });
    expect(renderedState.getValueText()).toBe("2");

    renderedState.rerender(5);
    expect(renderedState.getValueText()).toBe("5");

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(commit).not.toHaveBeenCalled();

    renderedState.rerender(1);
    expect(renderedState.getValueText()).toBe("1");
  });

  it("commits the current draft on demand", () => {
    const commit = vi.fn<(value: number) => void>();
    const renderedState = renderPacedState({ commit, committed: 1 });

    act(() => {
      getApi().setDraftValue(4);
    });
    expect(renderedState.getValueText()).toBe("4");

    act(() => {
      getApi().commitCurrent();
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenLastCalledWith(4);
  });
});
