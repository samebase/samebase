import { EditorSelection, type Text } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import {
  CODE_SURFACE_FONT_FAMILY,
  CODE_SURFACE_FONT_SIZE_PX,
  CODE_SURFACE_LINE_HEIGHT_PX,
} from "@/lib/codeSurfaceTypography";

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

// Keep the shared dark-mode selection translucent so editable ProseMark
// surfaces still preserve contrast against their own background colors.
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

const prosemarkCodeSurfaceTypographyTheme = EditorView.theme({
  ".cm-line": {
    fontFamily: `${CODE_SURFACE_FONT_FAMILY} !important`,
    fontSize: `${CODE_SURFACE_FONT_SIZE_PX}px !important`,
    lineHeight: `${CODE_SURFACE_LINE_HEIGHT_PX}px !important`,
    fontVariantLigatures: "none",
    paddingLeft: "0",
    paddingRight: "0",
  },
  ".cm-editor, .cm-content, .cm-scroller": {
    fontFamily: `${CODE_SURFACE_FONT_FAMILY} !important`,
    fontSize: `${CODE_SURFACE_FONT_SIZE_PX}px !important`,
    lineHeight: `${CODE_SURFACE_LINE_HEIGHT_PX}px !important`,
    fontVariantLigatures: "none",
  },
});

const prosemarkVsCodeLightTheme = EditorView.theme({
  ".cm-content": {
    "--pm-syntax-link": "#0451a5",
    "--pm-syntax-keyword": "#0000ff",
    "--pm-syntax-atom": "#098658",
    "--pm-syntax-literal": "#098658",
    "--pm-syntax-string": "#a31515",
    "--pm-syntax-regexp": "#811f3f",
    "--pm-syntax-definition-variable": "#1f1f1f",
    "--pm-syntax-local-variable": "#1f1f1f",
    "--pm-syntax-type-namespace": "#267f99",
    "--pm-syntax-class-name": "#267f99",
    "--pm-syntax-special-variable-macro": "#af00db",
    "--pm-syntax-definition-property": "#1f1f1f",
    "--pm-syntax-comment": "#008000",
    "--pm-syntax-invalid": "#cd3131",
    color: "#1f1f1f",
  },
});

const prosemarkVsCodeDarkTheme = EditorView.theme(
  {
    ".cm-content": {
      "--pm-syntax-link": "#4fc1ff",
      "--pm-syntax-keyword": "#569cd6",
      "--pm-syntax-atom": "#b5cea8",
      "--pm-syntax-literal": "#b5cea8",
      "--pm-syntax-string": "#ce9178",
      "--pm-syntax-regexp": "#d16969",
      "--pm-syntax-definition-variable": "#dcdcaa",
      "--pm-syntax-local-variable": "#9cdcfe",
      "--pm-syntax-type-namespace": "#4ec9b0",
      "--pm-syntax-class-name": "#4ec9b0",
      "--pm-syntax-special-variable-macro": "#c586c0",
      "--pm-syntax-definition-property": "#9cdcfe",
      "--pm-syntax-comment": "#6a9955",
      "--pm-syntax-invalid": "#f44747",
      color: "#d4d4d4",
    },
  },
  { dark: true },
);

export const prosemarkHiddenCursorTheme = EditorView.theme({
  ".cm-cursor": {
    display: "none",
  },
});

// The landing copy intentionally uses the exact secondary token instead of the
// shared translucent blend so the public selection highlight matches the design
// color precisely in dark mode.
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

export function getProsemarkFileThemeExtensions(args: {
  isDark: boolean;
  languageKind: "markdown" | "code" | "plain";
}) {
  if (args.languageKind === "markdown") {
    return args.isDark ? prosemarkDarkTheme : [];
  }

  return [
    prosemarkCodeSurfaceTypographyTheme,
    args.isDark ? prosemarkVsCodeDarkTheme : prosemarkVsCodeLightTheme,
    ...(args.isDark ? [prosemarkDarkSelectionTheme] : []),
  ];
}
