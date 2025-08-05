import { useRef, useEffect, useState, useCallback } from "react";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  foldKeymap,
} from "@codemirror/language";
import { dropCursor, rectangularSelection, keymap } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { useTheme } from "next-themes";
// TODO: Re-enable when adding collaborative features back
// import {
//   collab,
//   getSyncedVersion,
//   sendableUpdates,
//   receiveUpdates,
//   Update,
// } from "@codemirror/collab";
// import { ChangeSet, Text } from "@codemirror/state";
// import { ViewPlugin } from "@codemirror/view";
import { Text } from "@codemirror/state";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface CollaborativeCodeEditorProps {
  vaultId: Id<"vaults">;
  filePath: string;
  initialContent?: string;
  parentCommitSha: string;
  branch: string;
  fileName?: string;
  className?: string;
  onContentChange?: (content: string) => void;
}

// Language detection based on file extension
const getLanguageExtension = (fileName: string): Extension => {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";

  switch (extension) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: extension.includes("ts") });
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
      return javascript(); // fallback
  }
};

export function CollaborativeCodeEditor({
  vaultId,
  filePath,
  initialContent = "",
  parentCommitSha,
  branch,
  fileName,
  className,
  onContentChange,
}: CollaborativeCodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onContentChangeRef = useRef(onContentChange);
  // TODO: Re-enable when adding collaborative features back
  // const pushUpdatesRef = useRef<any>(null);
  // const clientIdRef = useRef<string>(...);
  const { theme, systemTheme } = useTheme();
  const [isInitialized, setIsInitialized] = useState(false);
  const documentContentRef = useRef<string>("");

  // Keep the callback ref up to date
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
    // pushUpdatesRef.current = pushUpdates;
  }, [onContentChange]);

  // Convex hooks for collaborative editing
  const document = useQuery(api.collaborative.getDocument, {
    vaultId,
    filePath,
  });

  const initializeFile = useMutation(
    api.collaborative.initializeCollaborativeFile,
  );
  // TODO: Re-enable when adding collaborative features back
  // const pushUpdates = useMutation(api.collaborative.pushUpdates);
  // TODO: Add back when collaborative features are re-enabled
  // const pullUpdates = useQuery(
  //   api.collaborative.pullUpdates,
  //   document
  //     ? {
  //         vaultId,
  //         filePath,
  //         version: document.version,
  //       }
  //     : "skip",
  // );

  // Initialize the collaborative document
  useEffect(() => {
    if (!isInitialized && !document) {
      initializeFile({
        vaultId,
        filePath,
        initialContent,
        parentCommitSha,
        branch,
      })
        .then(() => {
          setIsInitialized(true);
        })
        .catch(console.error);
    }
  }, [
    isInitialized,
    document,
    initializeFile,
    vaultId,
    filePath,
    initialContent,
    parentCommitSha,
    branch,
  ]);

  // TODO: Re-enable when adding collaborative features back
  // const createPeerPlugin = useCallback(() => { ... }, [vaultId, filePath]);

  // TODO: Add back collaborative update handling
  // Handle incoming updates
  // useEffect(() => {
  //   if (!viewRef.current || !pullUpdates || !pullUpdates.length) return;
  //   const updates: Update[] = pullUpdates.map((update) => ({
  //     changes: ChangeSet.fromJSON(JSON.parse(update.changes)),
  //     clientID: update.clientId,
  //   }));
  //   try {
  //     const transaction = receiveUpdates(viewRef.current.state, updates);
  //     viewRef.current.dispatch(transaction);
  //   } catch (error) {
  //     console.error("Failed to apply remote updates:", error);
  //   }
  // }, [pullUpdates]);

  // Initialize CodeMirror editor
  useEffect(() => {
    if (!editorRef.current) return;

    // Only create if editor doesn't exist yet
    if (viewRef.current) return;

    // Clean up existing editor
    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const effectiveTheme = theme === "system" ? systemTheme : theme;
    const isDark = effectiveTheme === "dark";
    const languageExtension = getLanguageExtension(fileName || "");

    // Custom basic setup
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
      // Add simple change handler using ref
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged && onContentChangeRef.current) {
          onContentChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    const extensions: Extension[] = [
      ...customBasicSetup,
      languageExtension,
      // TODO: Add back collaborative features once basic editor is stable
      // collab({ startVersion: document.version }),
      // createPeerPlugin(),
    ];

    if (isDark) {
      extensions.push(oneDark);
    }

    const state = EditorState.create({
      doc: Text.of((initialContent || "").split("\n")),
      extensions,
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    documentContentRef.current = initialContent || "";

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [filePath, theme, systemTheme, fileName, initialContent]); // Only recreate when file/theme changes

  // Handle document content updates without recreating the editor
  useEffect(() => {
    if (!viewRef.current || !document) return;

    // Only update if content actually changed
    if (documentContentRef.current !== document.content) {
      const transaction = viewRef.current.state.update({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: document.content,
        },
      });
      viewRef.current.dispatch(transaction);
      documentContentRef.current = document.content;
    }
  }, [document?.content]);

  return (
    <div
      ref={editorRef}
      className={className}
      style={{ height: "100%", width: "100%" }}
    />
  );
}
