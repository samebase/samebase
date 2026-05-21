import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  foldKeymap,
} from "@codemirror/language";
import { dropCursor, rectangularSelection, keymap, EditorView } from "@codemirror/view";

/**
 * File-view CodeMirror surfaces share the same base shell so editable code,
 * compare views, and visual parity fixtures stay aligned on typography and
 * gutter treatment.
 */
export const fileCodeMirrorBaseExtensions = [
  history(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  bracketMatching(),
  rectangularSelection(),
  EditorView.lineWrapping,
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
  EditorView.theme({
    "&": {
      height: "100%",
      minHeight: "0",
      border: "none !important",
      outline: "none !important",
      boxShadow: "none !important",
    },
    ".cm-editor": {
      height: "100%",
      minHeight: "0",
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
      minHeight: "0",
      // Code surfaces still rely on the native CodeMirror scroller, while the
      // file-view prose path opts into its own auto-height override below.
      overflowY: "auto !important",
      overflowX: "auto !important",
      border: "none !important",
      outline: "none !important",
    },
    ".cm-content": {
      // Keep the final line clear of mobile safe-area insets without adding a
      // permanent desktop gutter underneath the code surface.
      paddingBottom: "env(safe-area-inset-bottom)",
      border: "none !important",
      outline: "none !important",
    },
    ".cm-gutters": {
      display: "none !important",
      width: "0 !important",
      border: "none !important",
      borderRight: "none !important",
    },
    ".cm-foldGutter": {
      display: "none !important",
    },
    ".cm-line": {
      border: "none !important",
    },
  }),
];
