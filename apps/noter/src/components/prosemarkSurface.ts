import { EditorSelection, type Text } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

function isBlankLineText(text: string): boolean {
  return text.trim().length === 0;
}

function findFirstBlankLineAnchorInString(docText: string): number {
  let lineStart = 0;
  for (let index = 0; index <= docText.length; index += 1) {
    const isLineEnd =
      index === docText.length || docText.charCodeAt(index) === 10;
    if (!isLineEnd) continue;

    const lineText = docText.slice(lineStart, index);
    if (isBlankLineText(lineText)) {
      return lineStart;
    }

    lineStart = index + 1;
  }

  return docText.length;
}

function findFirstBlankLineAnchorInDoc(doc: Text): number {
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    if (isBlankLineText(line.text)) {
      return line.from;
    }
  }

  return doc.length;
}

export function findInitialSafeSelectionAnchor(docText: string): number {
  // Prefer the start of the first blank line so markdown stays folded by
  // default (avoids revealing markers at document start).
  return findFirstBlankLineAnchorInString(docText);
}

export const blurOnOutsidePointerDownExtension = ViewPlugin.fromClass(
  class {
    private blurTimeout: number | null = null;

    private onPointerDown = (event: PointerEvent) => {
      // If we click/tap on a non-focusable element (for example whitespace),
      // contenteditable won't necessarily blur by default. Mirror the common
      // "tap outside to dismiss" behavior so we always refold on blur.
      if (!this.view.hasFocus) return;
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (this.view.dom.contains(target)) return;

      // Defer to avoid browsers immediately restoring focus during the pointer
      // event sequence when no other focusable target exists.
      if (this.blurTimeout !== null) return;
      this.blurTimeout = window.setTimeout(() => {
        this.blurTimeout = null;
        if (!this.view.hasFocus) return;
        this.view.contentDOM.blur();
      }, 0);
    };

    constructor(private readonly view: EditorView) {
      document.addEventListener("pointerdown", this.onPointerDown, true);
    }

    destroy() {
      if (this.blurTimeout !== null) {
        window.clearTimeout(this.blurTimeout);
        this.blurTimeout = null;
      }
      document.removeEventListener("pointerdown", this.onPointerDown, true);
    }
  },
);

export const collapseSelectionOnBlurExtension = ViewPlugin.fromClass(
  class {
    private isScheduled = false;
    private collapseTimeout: number | null = null;

    update(update: ViewUpdate) {
      if (!update.focusChanged || update.view.hasFocus) return;

      const view = update.view;
      if (this.isScheduled) return;

      const safeAnchor = () => findFirstBlankLineAnchorInDoc(view.state.doc);

      const shouldCollapse = () => {
        const anchor = safeAnchor();
        const main = view.state.selection.main;
        return !(
          view.state.selection.ranges.length === 1 &&
          main.anchor === anchor &&
          main.head === anchor
        );
      };

      if (!shouldCollapse()) return;

      this.isScheduled = true;
      // Defer dispatch to avoid "Calls to EditorView.update are not allowed
      // while an update is in progress".
      this.collapseTimeout = window.setTimeout(() => {
        this.collapseTimeout = null;
        this.isScheduled = false;
        if (view.hasFocus || !view.dom.isConnected) return;
        if (!shouldCollapse()) return;

        // Collapse selection on a markdown-neutral line so Prosemark re-folds
        // list markers (`-`) into bullets and heading markers (`##`) into
        // headings.
        view.dispatch({
          selection: EditorSelection.single(safeAnchor()),
          scrollIntoView: false,
        });
      }, 0);
    }

    destroy() {
      if (this.collapseTimeout !== null) {
        window.clearTimeout(this.collapseTimeout);
        this.collapseTimeout = null;
      }
      this.isScheduled = false;
    }
  },
);

export const prosemarkSurfaceTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "inherit",
  },
  ".cm-editor": {
    backgroundColor: "transparent",
    color: "inherit",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    padding: "0",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "inherit",
    overflow: "visible",
    height: "auto",
  },
  ".cm-gutters": {
    display: "none",
  },
  "& .cm-rendered-list-mark": {
    display: "inline-block",
    width: "1ch !important",
    margin: "0 !important",
    textAlign: "center",
  },
});

const prosemarkDarkSelectionTheme = EditorView.theme(
  {
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, & .cm-selectionBackground":
      {
        backgroundColor: "hsl(var(--secondary) / 0.32) !important",
      },
    "& .cm-content::selection, & .cm-content *::selection": {
      backgroundColor: "hsl(var(--secondary) / 0.32) !important",
    },
  },
  { dark: true },
);

export const prosemarkDarkTheme = [oneDark, prosemarkDarkSelectionTheme];

export const prosemarkHiddenCursorTheme = EditorView.theme({
  ".cm-cursor": {
    display: "none",
  },
});

export const prosemarkLandingCopyDarkSelectionTheme = EditorView.theme(
  {
    "&.cm-landing-copy .cm-content::selection, &.cm-landing-copy .cm-content ::selection":
      {
        backgroundColor: "hsl(var(--secondary)) !important",
        color: "hsl(var(--secondary-foreground)) !important",
      },
  },
  { dark: true },
);
