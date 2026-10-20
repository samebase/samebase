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

type PulledUpdate = { clientID: string; changes: string; version: number; userId: string };

type ModelEdit = {
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  text: string;
};

const testState = vi.hoisted(() => ({
  mutation: vi.fn(),
  query: vi.fn(),
  mountEditor: () => {},
  pulledUpdatesByVersion: new Map<number, PulledUpdate[]>(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  const client = { mutation: testState.mutation, query: testState.query };
  return { ...actual, useConvex: () => client };
});

vi.mock("@/lib/convexQueryCache", () => ({
  useCacheQuery: (_reference: unknown, args: { version: number }) =>
    testState.pulledUpdatesByVersion.get(args.version),
}));

vi.mock("@/repository/editor/useProjectFiles", () => ({
  useProjectFiles: () => ({ files: [], scopePrefix: "" }),
}));

vi.mock("./monaco/setupEditor", () => ({
  applyTsConfigToMonaco: () => {},
  parseTsConfig: () => ({}),
}));

vi.mock("./monaco/ata", () => ({
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
  const updates: PulledUpdate[] = [];
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
  const offsetAt = (lineNumber: number, column: number) =>
    value
      .split("\n")
      .slice(0, lineNumber - 1)
      .reduce((offset, line) => offset + line.length + 1, column - 1);
  const model = {
    getPositionAt: (offset: number) => {
      const lines = value.slice(0, offset).split("\n");
      return { lineNumber: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
    },
    applyEdits: (edits: ModelEdit[]) => {
      for (const { range, text } of [...edits].reverse()) {
        const from = offsetAt(range.startLineNumber, range.startColumn);
        const to = offsetAt(range.endLineNumber, range.endColumn);
        value = value.slice(0, from) + text + value.slice(to);
      }
    },
  };
  return {
    value: () => value,
    reset: (content: string) => {
      value = content;
      listeners.length = 0;
    },
    typeAt: (rangeOffset: number, text: string) => {
      value = value.slice(0, rangeOffset) + text + value.slice(rangeOffset);
      for (const listener of listeners) {
        listener({ changes: [{ rangeOffset, rangeLength: 0, text }] });
      }
    },
    editor: {
      getModel: () => model,
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
    testState.pulledUpdatesByVersion.clear();
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

    act(() => fakeEditor.typeAt(5, " world"));
    await vi.advanceTimersByTimeAsync(500);
    expect(testState.mutation).toHaveBeenCalledTimes(1);

    act(() => fakeEditor.typeAt(11, "!"));
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

  it("applies remote updates that arrived before Monaco mounted", async () => {
    vi.useFakeTimers();
    const server = createCollaborativeServer("hello");
    server.pushUpdates({
      version: 0,
      updates: [
        {
          clientId: "other-client",
          changes: JSON.stringify(ChangeSet.of({ from: 5, insert: " there" }, 5).toJSON()),
        },
      ],
    });
    testState.pulledUpdatesByVersion.set(0, server.pullUpdates({ version: 0 }));
    testState.mutation.mockImplementation(async (_reference: unknown, args: PushArgs) =>
      server.pushUpdates(args),
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
    expect(fakeEditor.value()).toBe("hello there");

    act(() => fakeEditor.typeAt(11, "!"));
    await vi.advanceTimersByTimeAsync(500);
    expect(server.content()).toBe("hello there!");

    await act(async () => root.unmount());
    rootElement.remove();
  });

  it("pushes an edit to a CRLF document without changing its line endings", async () => {
    vi.useFakeTimers();
    const server = createCollaborativeServer("a\r\nb\r\n");
    testState.mutation.mockImplementation(async (_reference: unknown, args: PushArgs) =>
      server.pushUpdates(args),
    );
    fakeEditor.reset("a\r\nb\r\n");

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    await act(async () => {
      root.render(
        <MonacoEditor
          firstDoc={{ version: 0, content: "a\r\nb\r\n" }}
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

    // Monaco offsets count each CRLF as two characters, so offset 4 is the end of "b".
    act(() => fakeEditor.typeAt(4, "c"));
    await vi.advanceTimersByTimeAsync(500);
    expect(server.content()).toBe("a\r\nbc\r\n");

    await act(async () => root.unmount());
    rootElement.remove();
  });
});
