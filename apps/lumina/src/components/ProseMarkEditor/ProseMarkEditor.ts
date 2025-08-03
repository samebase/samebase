/* eslint-disable @typescript-eslint/no-non-null-assertion */
// import "./style.css";
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
import { EditorState } from "@codemirror/state";
import {
  dropCursor,
  EditorView,
  keymap,
  rectangularSelection,
} from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  prosemarkBasicSetup,
  prosemarkBaseThemeSetup,
  prosemarkMarkdownSyntaxExtensions,
} from "@prosemark/core";
import * as ProseMark from "@prosemark/core";
// import { htmlBlockExtension } from '@prosemark/render-html';
import { indentWithTab } from "@codemirror/commands";
import { GFM } from "@lezer/markdown";
import { syntaxTree } from "@codemirror/language";
import { printTree } from "@lezer-unofficial/printer";
// import initDoc from "./initDoc.md?raw";

// document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
//   <div>
//     <div id="codemirror-container"></div>
//   </div>
// `;

export interface ProseMarkEditorOptions {
  content: string;
  onChange?: (value: string) => void;
  parent: HTMLElement;
  isDark?: boolean;
}

export function createProseMarkEditor({
  content,
  onChange,
  parent,
  isDark = false,
}: ProseMarkEditorOptions) {
  // Custom basic setup without line numbers and with minimal borders
  const customBasicSetup = [
    history(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    rectangularSelection(),
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

  const extensions = [
    ...customBasicSetup,
    markdown({
      codeLanguages: languages,
      extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
    }),
    EditorView.lineWrapping,
    prosemarkBasicSetup(),
    prosemarkBaseThemeSetup(),
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
