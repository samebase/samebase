// @vitest-environment jsdom

import "@/test/reactActEnvironment";
import { ChangeSet, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { CodeEditor } from "./CodeEditor";

const testState = vi.hoisted(() => ({
  mutation: vi.fn(),
  query: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  const client = { mutation: testState.mutation, query: testState.query };
  return { ...actual, useConvex: () => client };
});

vi.mock("@/lib/convexQueryCache", () => ({
  useCacheQuery: () => undefined,
}));

vi.mock("./MonacoEditor", () => ({
  MonacoEditor: () => null,
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

function isPageLeaveBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function typeAtEnd(view: EditorView, text: string) {
  view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
}

describe("CodeEditor", () => {
  afterEach(() => {
    testState.mutation.mockReset();
    testState.query.mockReset();
    vi.useRealTimers();
  });

  it("mounts and syncs prose without changing CRLF line endings", async () => {
    vi.useFakeTimers();
    const initialContent = "a\r\nb\r\n";
    const server = createCollaborativeServer(initialContent);
    testState.mutation.mockImplementation(async (_reference: unknown, args: PushArgs) =>
      server.pushUpdates(args),
    );
    testState.query.mockImplementation(async (_reference: unknown, args: { version: number }) =>
      server.pullUpdates(args),
    );
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(
          <CodeEditor
            firstDoc={{ version: 0, content: initialContent }}
            githubRepositoryFullName="samebase/samebase"
            branch="main"
            filePath="notes.md"
          />,
        );
      });
      const editorElement = rootElement.querySelector<HTMLElement>(".cm-editor");
      if (!editorElement) throw new Error("CodeEditor did not mount a CodeMirror view.");
      const view = EditorView.findFromDOM(editorElement);
      if (!view) throw new Error("CodeEditor did not mount a CodeMirror view.");

      await act(async () => {
        typeAtEnd(view, "!");
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(server.content()).toBe(`${initialContent}!`);
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });

  it("sends edits typed during an in-flight push after the editor unmounts", async () => {
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

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    await act(async () => {
      root.render(
        <CodeEditor
          firstDoc={{ version: 0, content: "hello" }}
          githubRepositoryFullName="samebase/samebase"
          branch="main"
          filePath="notes.md"
        />,
      );
    });
    const editorElement = rootElement.querySelector<HTMLElement>(".cm-editor");
    if (!editorElement) throw new Error("CodeEditor did not mount a CodeMirror view.");
    const view = EditorView.findFromDOM(editorElement);
    if (!view) throw new Error("CodeEditor did not mount a CodeMirror view.");

    typeAtEnd(view, " world");
    await vi.advanceTimersByTimeAsync(500);
    expect(testState.mutation).toHaveBeenCalledTimes(1);

    typeAtEnd(view, "!");
    await act(async () => root.unmount());
    rootElement.remove();
    expect(isPageLeaveBlocked()).toBe(true);

    releaseServer();
    await vi.advanceTimersByTimeAsync(5000);

    expect(server.content()).toBe("hello world!");
    expect(isPageLeaveBlocked()).toBe(false);
  });
});
