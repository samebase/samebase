import { useRef, useEffect } from "react";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView } from "codemirror";
// Note: closeBrackets functionality requires @codemirror/autocomplete package
// which is not installed in this project
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
import { createProseMarkEditor } from "./ProseMarkEditor/ProseMarkEditor";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  fileName?: string;
  className?: string;
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

export function CodeEditor({
  value,
  onChange,
  fileName,
  className,
}: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const { theme, systemTheme } = useTheme();

  // Keep onChange ref up to date
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!editorRef.current) return;

    // Determine if we should use dark theme
    const effectiveTheme = theme === "system" ? systemTheme : theme;
    const isDark = effectiveTheme === "dark";

    // Check if this is a markdown file
    const useProseMarkEditor = isMarkdownFile(fileName);

    let editor: EditorView;

    if (useProseMarkEditor) {
      // Use ProseMarkEditor for markdown files
      editor = createProseMarkEditor({
        content: value,
        onChange: (newValue: string) => onChangeRef.current(newValue),
        parent: editorRef.current,
        isDark,
      });
    } else {
      // Use regular CodeMirror for other file types
      const languageExtension = getLanguageExtension(fileName || "");

      const extensions: Extension[] = [...customBasicSetup, languageExtension];

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
          doc: value,
          extensions,
        }),
        parent: editorRef.current,
      });
    }

    viewRef.current = editor;

    // Cleanup function
    return () => {
      editor.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName, theme, systemTheme]); // Re-create editor when theme or filename changes (value intentionally excluded to prevent recreation on every keystroke)

  // Update editor content when value prop changes
  useEffect(() => {
    if (viewRef.current && viewRef.current.state.doc.toString() !== value) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: value,
        },
      });
    }
  }, [value]);

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
