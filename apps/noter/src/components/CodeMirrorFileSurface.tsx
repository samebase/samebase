import { useEffect, useRef } from "react";
import {
  Compartment,
  EditorSelection,
  EditorState,
  type Extension,
} from "@codemirror/state";
import { EditorView } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { useTheme } from "next-themes";
import { prosemarkBaseThemeSetup, prosemarkBasicSetup } from "@prosemark/core";
import { printTree } from "@lezer-unofficial/printer";
import { useProsemarkMobilePaneDrag } from "@/components/useProsemarkMobilePaneDrag";
import {
  blurOnOutsidePointerDownExtension,
  collapseSelectionOnBlurExtension,
  findInitialSafeSelectionAnchor,
  getProsemarkFileThemeExtensions,
  prosemarkSurfaceTheme,
} from "@/components/prosemarkSurface";
import {
  getCodeMirrorFileLanguageKind,
  getInitialCodeMirrorLanguageExtension,
  loadCodeMirrorLanguageExtension,
} from "@/lib/codemirrorLanguage";
import { fileCodeMirrorBaseExtensions } from "@/lib/fileCodeMirrorBaseExtensions";

const prosemarkFileViewAutoHeightTheme = EditorView.theme({
  "&": {
    height: "auto",
    minHeight: "0",
  },
  ".cm-editor": {
    height: "auto",
    minHeight: "0",
  },
  ".cm-scroller": {
    height: "auto",
    // The surrounding workspace scene owns vertical scrolling for read-only
    // prose file views, so the editor shell must collapse into plain content
    // instead of keeping a hidden inner overflow box.
    overflowY: "visible !important",
    overflowX: "visible !important",
  },
});

const EMPTY_EXTENSIONS: readonly Extension[] = [];

/**
 * Hosts the real file-view CodeMirror/ProseMark surface without the collaborative
 * transport layer so fixtures can exercise the same mounted editor shell the
 * product route uses.
 */
export function CodeMirrorFileSurface({
  dataTestId,
  extraExtensions = EMPTY_EXTENSIONS,
  filePath,
  initialValue,
}: {
  dataTestId?: string;
  extraExtensions?: readonly Extension[];
  filePath: string;
  initialValue: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pendingLanguageLoadRef = useRef<symbol | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const { theme, systemTheme } = useTheme();
  const initialValueRef = useRef(initialValue);
  const themeRef = useRef(theme);
  const systemThemeRef = useRef(systemTheme);
  const mobilePaneDrag = useProsemarkMobilePaneDrag(true, containerRef);
  const languageKind = getCodeMirrorFileLanguageKind(filePath);
  const isAutoHeightSurface = languageKind !== "code";

  initialValueRef.current = initialValue;
  themeRef.current = theme;
  systemThemeRef.current = systemTheme;

  useEffect(() => {
    let editor: EditorView | null = null;
    const languageLoadKey = Symbol("code-editor-language-load");
    const languageCompartment = new Compartment();

    const mountEditor = async () => {
      if (!editorRef.current) {
        return;
      }

      const effectiveTheme =
        themeRef.current === "system"
          ? systemThemeRef.current
          : themeRef.current;
      const isDark = effectiveTheme === "dark";
      const prosemarkSelectionAnchor =
        languageKind === "code"
          ? undefined
          : EditorSelection.single(
              findInitialSafeSelectionAnchor(initialValueRef.current),
            );

      editor = new EditorView({
        state: EditorState.create({
          doc: initialValueRef.current,
          selection: prosemarkSelectionAnchor,
          extensions: [
            ...fileCodeMirrorBaseExtensions,
            languageCompartment.of(
              getInitialCodeMirrorLanguageExtension(filePath),
            ),
            prosemarkBasicSetup(),
            prosemarkBaseThemeSetup(),
            ...(isAutoHeightSurface
              ? [
                  // Keep the shared ProseMark surface rules aligned with the
                  // other shipped markdown surfaces so mobile gesture and
                  // selection fixes land in one place.
                  blurOnOutsidePointerDownExtension,
                  collapseSelectionOnBlurExtension,
                  prosemarkSurfaceTheme,
                  prosemarkFileViewAutoHeightTheme,
                ]
              : []),
            themeCompartmentRef.current.of(
              getProsemarkFileThemeExtensions({ isDark, languageKind }),
            ),
            keymap.of([
              indentWithTab,
              {
                key: "Alt-p",
                run: (view) => {
                  console.log(
                    printTree(
                      syntaxTree(view.state),
                      view.state.doc.toString(),
                    ),
                  );
                  return true;
                },
              },
            ]),
            ...extraExtensions,
          ],
        }),
        parent: editorRef.current,
      });

      viewRef.current = editor;
      pendingLanguageLoadRef.current = languageLoadKey;

      try {
        const languageExtension =
          await loadCodeMirrorLanguageExtension(filePath);
        if (pendingLanguageLoadRef.current !== languageLoadKey) {
          return;
        }

        pendingLanguageLoadRef.current = null;
        editor.dispatch({
          effects: languageCompartment.reconfigure(languageExtension),
        });
      } catch {
        if (pendingLanguageLoadRef.current !== languageLoadKey) {
          return;
        }

        // The editor already mounted with the synchronous fallback parser, so
        // keep it stable instead of surfacing an unhandled rejection.
        pendingLanguageLoadRef.current = null;
      }
    };

    void mountEditor();

    return () => {
      if (pendingLanguageLoadRef.current === languageLoadKey) {
        pendingLanguageLoadRef.current = null;
      }
      editor?.destroy();
      viewRef.current = null;
    };
  }, [extraExtensions, filePath, isAutoHeightSurface, languageKind]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const effectiveTheme = theme === "system" ? systemTheme : theme;
    const isDark = effectiveTheme === "dark";
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(
        getProsemarkFileThemeExtensions({ isDark, languageKind }),
      ),
    });
  }, [languageKind, systemTheme, theme]);

  return (
    <div
      ref={containerRef}
      data-testid={dataTestId}
      className={
        isAutoHeightSurface
          ? "relative w-full"
          : "relative h-full min-h-0 w-full"
      }
      style={{ touchAction: mobilePaneDrag.touchAction }}
      {...mobilePaneDrag.containerProps}
    >
      <div
        ref={editorRef}
        className={
          isAutoHeightSurface
            ? "notranslate w-full"
            : "notranslate h-full min-h-0 w-full"
        }
        translate="no"
      />
    </div>
  );
}
