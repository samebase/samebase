/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable prefer-const */
import { useRef, useEffect } from "react";
import { ChangeSet, EditorState, Extension, Text } from "@codemirror/state";
import { EditorView } from "codemirror";
import { languages } from "@codemirror/language-data";
import * as ProseMark from "@prosemark/core";
// Note: closeBrackets functionality requires @codemirror/autocomplete package
// which is not installed in this project
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  foldKeymap,
  syntaxTree,
} from "@codemirror/language";
import {
  dropCursor,
  rectangularSelection,
  keymap,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { useTheme } from "next-themes";
import {
  collab,
  getSyncedVersion,
  receiveUpdates,
  sendableUpdates,
  Update,
} from "@codemirror/collab";
import { client } from "@/main";
import { api } from "../../convex/_generated/api";
import { Id } from "convex/_generated/dataModel";
import { GFM } from "@lezer/markdown";
import {
  prosemarkBaseThemeSetup,
  prosemarkBasicSetup,
  prosemarkMarkdownSyntaxExtensions,
} from "@prosemark/core";
import { printTree } from "@lezer-unofficial/printer";
import { useQuery } from "convex/react";

// Temporary:
const tempVaultId = "k976ryb9d1m2gyvxhps87dac257mv5ps" as Id<"vaults">;
const tempFilePath = "README.md";

export function createProseMarkEditor({
  content,
  version,
  onChange,
  parent,
  isDark = false,
}: {
  content: string | Text;
  onChange?: (value: string) => void;
  parent: HTMLElement;
  isDark?: boolean;
  version: number;
}) {
  // Custom basic setup without line numbers and with minimal borders

  const extensions = [
    ...customBasicSetup,
    markdown({
      codeLanguages: languages,
      extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
    }),
    EditorView.lineWrapping,
    prosemarkBasicSetup(),
    prosemarkBaseThemeSetup(),
    peerExtension(version),

    keymap.of([
      indentWithTab,
      {
        key: "Alt-p",
        run: (view) => {
          console.log(
            printTree(syntaxTree(view.state), view.state.doc.toString()),
          );
          return true;
        },
      },
    ]),
  ];

  // Add dark theme if requested
  if (isDark) {
    extensions.push(oneDark);
  }

  // Add change listener if onChange is provided
  if (onChange) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      }),
    );
  }

  const editor = new EditorView({
    extensions,
    doc: content,
    parent,
  });

  // for easier debugging
  Object.assign(window, { editor, ProseMark });

  return editor;
}

/*
// Copied from 

let pending: ((value: any) => void)[] = []

self.onmessage = event => {
  function resp(value: any) {
    event.ports[0].postMessage(JSON.stringify(value))
  }
  let data = JSON.parse(event.data)
  if (data.type == "pullUpdates") {
    if (data.version < updates.length)
      resp(updates.slice(data.version))
    else
      pending.push(resp)
  } else if (data.type == "pushUpdates") {
    // Convert the JSON representation to an actual ChangeSet
    // instance
    let received = data.updates.map(json => ({
      clientID: json.clientID,
      changes: ChangeSet.fromJSON(json.changes)
    }))
    if (data.version != updates.length)
      received = rebaseUpdates(received, updates.slice(data.version))
    for (let update of received) {
      updates.push(update)
      doc = update.changes.apply(doc)
    }
    resp(true)
    if (received.length) {
      // Notify pending requests
      let json = received.map(update => ({
        clientID: update.clientID,
        changes: update.changes.toJSON()
      }))
      while (pending.length) pending.pop()!(json)
    }
  } else if (data.type == "getDocument") {
    resp({version: updates.length, doc: doc.toString()})
  }
}
 */

function awaitTimeout(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeout);
  });
}

const delay = 500;

async function getDocument(opts?: {
  delay?: number;
}): Promise<{ version: number; doc: Text }> {
  // only for dev
  if (opts?.delay) {
    await awaitTimeout(opts.delay);
  }
  const data = await client.query(api.collaborative.getDocument, {
    vaultId: tempVaultId,
    filePath: tempFilePath,
  });

  console.log(data.content);

  return {
    version: data.version,
    doc: Text.of(data.content.split("\n")),
  };
}

async function pushUpdates(
  version: number,
  fullUpdates: readonly Update[],
): Promise<boolean> {
  await awaitTimeout(delay);
  // Strip off transaction data
  let updates = fullUpdates.map((u) => ({
    clientId: u.clientID,
    changes: JSON.stringify(u.changes.toJSON()),
  }));

  return client
    .mutation(api.collaborative.pushUpdates, {
      vaultId: tempVaultId,
      filePath: tempFilePath,
      version,
      updates,
    })
    .then((result) => result.success);
}

async function pullUpdates(version: number): Promise<readonly Update[]> {
  await awaitTimeout(delay);
  return client
    .query(api.collaborative.pullUpdates, {
      vaultId: tempVaultId,
      filePath: tempFilePath,
      version,
    })
    .then((updates) =>
      updates.map((u) => ({
        changes: ChangeSet.fromJSON(JSON.parse(u.changes)),
        clientID: u.clientId,
      })),
    );
}

// https://github.com/codemirror/website/blob/main/site/examples/collab/collab.ts#L89
export function peerExtension(startVersion: number) {
  let plugin = ViewPlugin.fromClass(
    class {
      private pushing = false;
      private done = false;

      constructor(private view: EditorView) {
        this.pull();
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.push();
      }

      async push() {
        let updates = sendableUpdates(this.view.state);
        if (this.pushing || !updates.length) return;
        this.pushing = true;
        let version = getSyncedVersion(this.view.state);
        await pushUpdates(version, updates);
        this.pushing = false;
        // Regardless of whether the push failed or new updates came in
        // while it was running, try again if there's updates remaining
        if (sendableUpdates(this.view.state).length)
          setTimeout(() => this.push(), 100);
      }

      async pull() {
        while (!this.done) {
          console.log("pulling");
          let version = getSyncedVersion(this.view.state);
          let updates = await pullUpdates(version);
          this.view.dispatch(receiveUpdates(this.view.state, updates));
        }
      }

      destroy() {
        this.done = true;
      }
    },
  );
  return [collab({ startVersion }), plugin];
}

// Custom basic setup without line numbers and with minimal borders
const customBasicSetup = [
  history(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  bracketMatching(),
  rectangularSelection(),
  EditorView.lineWrapping,
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
  // Custom theme to remove all borders
  EditorView.theme({
    "&": {
      border: "none !important",
      outline: "none !important",
      boxShadow: "none !important",
    },
    ".cm-editor": {
      border: "none !important",
      outline: "none !important",
      boxShadow: "none !important",
    },
    ".cm-editor.cm-focused": {
      outline: "none !important",
      border: "none !important",
      boxShadow: "none !important",
    },
    ".cm-focused": {
      outline: "none !important",
      border: "none !important",
      boxShadow: "none !important",
    },
    ".cm-scroller": {
      border: "none !important",
      outline: "none !important",
    },
    ".cm-content": {
      border: "none !important",
      outline: "none !important",
    },
    ".cm-gutters": {
      border: "none !important",
      borderRight: "none !important",
    },
    ".cm-line": {
      border: "none !important",
    },
  }),
];
// Language detection based on file extension
const getLanguageExtension = (fileName: string): Extension => {
  const ext = fileName.toLowerCase().split(".").pop();

  switch (ext) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: ext.includes("ts") });
    case "md":
    case "markdown":
      return markdown();
    case "json":
      return json();
    case "html":
    case "htm":
      return html();
    case "css":
      return css();
    case "py":
      return python();
    default:
      return markdown(); // Default to markdown for text files
  }
};

// Check if file is markdown
const isMarkdownFile = (fileName?: string) => {
  if (!fileName) return true; // Default to markdown if no filename
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension === "md" || extension === "markdown";
};

export function CodeEditorWrapper({
  // value,
  onChange,
  fileName,
  className,
}: {
  // value: string;
  onChange: (value: string) => void;
  fileName?: string;
  className?: string;
}) {
  const firstDoc = useQuery(api.collaborative.getDocument, {
    vaultId: tempVaultId,
    filePath: tempFilePath,
  });

  if (!firstDoc) return null;

  return (
    <CodeEditor
      firstDoc={firstDoc}
      onChange={onChange}
      fileName={fileName}
      className={className}
    />
  );
}

export function CodeEditor({
  firstDoc,
  onChange,
  fileName,
  className,
}: {
  firstDoc: { version: number; content: string; exists: boolean };
  onChange: (value: string) => void;
  fileName?: string;
  className?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const { theme, systemTheme } = useTheme();
  // 3 letters/digits to differentiate the mounted editor
  const idRef = useRef(Math.random().toString(36).substring(2, 5));

  // Keep onChange ref up to date
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  console.log({ firstDoc });

  // const data = useQuery(api.collaborative.pullUpdates, {
  //   vaultId: tempVaultId,
  //   filePath: tempFilePath,
  //   version: firstDoc.version,
  // });

  useEffect(() => {
    let cancelled = false;
    let editor: EditorView | null = null;

    const func = async () => {
      console.log("starting func", idRef.current);
      if (!editorRef.current) return;

      const { version, doc } = await getDocument();

      if (cancelled) return;

      // Determine if we should use dark theme
      const effectiveTheme = theme === "system" ? systemTheme : theme;
      const isDark = effectiveTheme === "dark";

      // Check if this is a markdown file
      const useProseMarkEditor = isMarkdownFile(fileName);

      if (useProseMarkEditor) {
        // Use ProseMarkEditor for markdown files
        editor = createProseMarkEditor({
          content: doc,
          version,
          onChange: (newValue: string) => onChangeRef.current(newValue),
          parent: editorRef.current,
          isDark,
        });
      } else {
        // Use regular CodeMirror for other file types
        const languageExtension = getLanguageExtension(fileName || "");

        const extensions: Extension[] = [
          ...customBasicSetup,
          languageExtension,
          peerExtension(0),
        ];

        if (isDark) {
          extensions.push(oneDark);
        }

        // Add change listener
        extensions.push(
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        );

        editor = new EditorView({
          state: EditorState.create({
            doc,
            extensions,
          }),
          parent: editorRef.current,
        });
      }

      viewRef.current = editor;

      console.log("finished created editor", idRef.current);
    };

    func();
    // Cleanup function
    return () => {
      cancelled = true;
      editor?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName, theme, systemTheme]); // Re-create editor when theme or filename changes (value intentionally excluded to prevent recreation on every keystroke)

  return (
    <div
      ref={editorRef}
      className={`h-full w-full ${className || ""}`}
      style={{
        height: "100%",
        minHeight: "400px", // Minimum height for usability
        border: "none",
        outline: "none",
        boxShadow: "none",
      }}
    />
  );
}
