// @vitest-environment jsdom

import "@/test/reactActEnvironment";
import { ChangeSet, Text } from "@codemirror/state";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../convex/_generated/dataModel";
import { MonacoEditor } from "./MonacoEditor";

type ContentChangeListener = (event: {
  changes: Array<{ rangeOffset: number; rangeLength: number; text: string }>;
}) => void;

const testState = vi.hoisted(() => ({
  mutation: vi.fn(),
  query: vi.fn(),
  mountEditor: () => {},
}));

vi.mock("@/lib/convexClient", () => ({
  client: { mutation: testState.mutation, query: testState.query },
}));

vi.mock("@/lib/convexQueryCache", () => ({
  useCacheQuery: () => undefined,
}));

vi.mock("@/repository/editor/useProjectFiles", () => ({
  useProjectFiles: () => ({ files: [], scopePrefix: "" }),
}));

vi.mock("./monaco/setupEditor", () => ({
  applyTsConfigToMonaco: () => {},
  parseTsConfig: () => ({}),
  setupEditorATA: () => {},
}));

// Monaco cannot run in jsdom, so the surface hands the component a model
// that records edits the same way Monaco reports them.
vi.mock("@/components/MonacoEditorSurface", () => ({
  MonacoEditorSurface: ({
    onMount,
  }: {
    onMount: (editor: unknown, monaco: unknown) => void;
  }): null => {
    testState.mountEditor = () => onMount(fakeEditor.editor, {});
    return null;
  },
}));

type PushArgs = { version: number; updates: Array<{ clientId: string; changes: string }> };

function createCollaborativeServer(content: string) {
  let doc = Text.of(content.split("\n"));
  const updates: Array<{ clientID: string; changes: string; version: number; userId: string }> = [];
  return {
    content: () => doc.toString(),
    pushUpdates: (args: PushArgs) => {
      if (args.version !== updates.length) {
        return { success: false, newVersion: updates.length };
      }
      for (const update of args.updates) {
        doc = ChangeSet.fromJSON(JSON.parse(update.changes)).apply(doc);
        updates.push({
          clientID: update.clientId,
          changes: update.changes,
          version: updates.length + 1,
          userId: "user",
        });
      }
      return { success: true, newVersion: updates.length };
    },
    pullUpdates: (args: { version: number }) =>
      updates.filter((update) => update.version > args.version),
  };
}

function createFakeMonacoEditor() {
  let value = "";
  const listeners: ContentChangeListener[] = [];
  return {
    reset: (content: string) => {
      value = content;
      listeners.length = 0;
    },
    typeAtEnd: (text: string) => {
      const rangeOffset = value.length;
      value += text;
      for (const listener of listeners) {
        listener({ changes: [{ rangeOffset, rangeLength: 0, text }] });
      }
    },
    editor: {
      getModel: () => null,
      onDidChangeModelContent: (listener: ContentChangeListener) => {
        listeners.push(listener);
      },
    },
  };
}

const fakeEditor = createFakeMonacoEditor();

function fakeRepositoryId(value: string): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; the editor only forwards this one.
  return value;
}

function isPageLeaveBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("MonacoEditor", () => {
  afterEach(() => {
    testState.mutation.mockReset();
    testState.query.mockReset();
    vi.useRealTimers();
  });

  it("sends edits typed during an in-flight push once after the editor unmounts", async () => {
    vi.useFakeTimers();
    const server = createCollaborativeServer("hello");
    let releaseServer = () => {};
    const serverReachable = new Promise<void>((resolve) => {
      releaseServer = resolve;
    });
    // The editor only calls `pushUpdates` as a mutation and `pullUpdates` as a query.
    testState.mutation.mockImplementation(async (_reference: unknown, args: PushArgs) => {
      await serverReachable;
      return server.pushUpdates(args);
    });
    testState.query.mockImplementation(async (_reference: unknown, args: { version: number }) =>
      server.pullUpdates(args),
    );
    fakeEditor.reset("hello");

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    await act(async () => {
      root.render(
        <MonacoEditor
          firstDoc={{ version: 0, content: "hello" }}
          githubRepositoryFullName="samebase/samebase"
          branch="main"
          filePath="src/index.ts"
          repositoryId={fakeRepositoryId("repository-a")}
          tree={[]}
          treeSHA="tree-a"
        />,
      );
    });
    act(() => testState.mountEditor());

    act(() => fakeEditor.typeAtEnd(" world"));
    await vi.advanceTimersByTimeAsync(500);
    expect(testState.mutation).toHaveBeenCalledTimes(1);

    act(() => fakeEditor.typeAtEnd("!"));
    await act(async () => root.unmount());
    rootElement.remove();
    expect(isPageLeaveBlocked()).toBe(true);

    releaseServer();
    await vi.advanceTimersByTimeAsync(5000);

    expect(server.content()).toBe("hello world!");
    expect(isPageLeaveBlocked()).toBe(false);
    const settledPushCount = testState.mutation.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(testState.mutation).toHaveBeenCalledTimes(settledPushCount);
  });
});
