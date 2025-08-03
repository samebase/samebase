import { useRef, useEffect } from "react";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { useTheme } from "next-themes";
import { createEditor } from "./ProseMarkEditor/ProseMarkEditor";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  fileName?: string;
  className?: string;
}

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

export function CodeEditor({
  value,
  onChange,
  fileName,
  className,
}: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { theme, systemTheme } = useTheme();

  useEffect(() => {
    console.log("Creating editor");
    const editor = createEditor();
    return () => {
      console.log("Destroying editor");
      editor.destroy();
    };
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;

    // Determine if we should use dark theme
    const effectiveTheme = theme === "system" ? systemTheme : theme;
    const isDark = effectiveTheme === "dark";

    // Get language extension based on file name
    const languageExtension = fileName
      ? getLanguageExtension(fileName)
      : markdown();

    // Create editor state
    const extensions: Extension[] = [basicSetup, languageExtension];

    if (isDark) {
      extensions.push(oneDark);
    }

    // Create editor view
    // const view = editor;

    // viewRef.current = view;

    // Cleanup function
    // return () => {
    //   view.destroy();
    //   viewRef.current = null;
    // };
  }, [fileName, theme, systemTheme]); // Re-create editor when theme changes

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
    <div>
      <div id="codemirror-container"></div>
      {false && (
        <div
          ref={editorRef}
          className={`h-full w-full ${className || ""}`}
          style={{
            height: "100%",
            minHeight: "400px", // Minimum height for usability
          }}
        />
      )}
    </div>
  );
}
