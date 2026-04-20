import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { prosemarkBaseThemeSetup, prosemarkBasicSetup } from "@prosemark/core";
import { onCleanup, onMount } from "solid-js";

function findInitialSafeSelectionAnchor(docText: string) {
  let lineStart = 0;
  for (let index = 0; index <= docText.length; index += 1) {
    const isLineEnd =
      index === docText.length || docText.charCodeAt(index) === 10;
    if (!isLineEnd) {
      continue;
    }

    const lineText = docText.slice(lineStart, index);
    if (lineText.trim().length === 0) {
      return lineStart;
    }

    lineStart = index + 1;
  }

  return docText.length;
}

const prosemarkSurfaceTheme = EditorView.theme({
  "&": {
    height: "100%",
  },
  ".cm-editor": {
    height: "100%",
    touchAction: "pan-y",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    minHeight: "100%",
    padding: "0.5rem 0.75rem",
    touchAction: "pan-y",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-line": {
    padding: "0",
    touchAction: "pan-y",
  },
  ".cm-scroller": {
    overflow: "auto",
    touchAction: "pan-y",
  },
});

export function ProsemarkSurface(props: {
  dataTestId: string;
  initialValue?: string;
}) {
  let hostRef: HTMLDivElement | undefined;

  onMount(() => {
    if (!hostRef) {
      return;
    }

    const themeCompartment = new Compartment();
    const initialValue = props.initialValue ?? "";
    const editor = new EditorView({
      parent: hostRef,
      state: EditorState.create({
        doc: initialValue,
        selection: EditorSelection.single(
          findInitialSafeSelectionAnchor(initialValue),
        ),
        extensions: [
          markdown(),
          prosemarkBasicSetup(),
          prosemarkBaseThemeSetup(),
          EditorView.lineWrapping,
          keymap.of([indentWithTab]),
          themeCompartment.of(prosemarkSurfaceTheme),
        ],
      }),
    });

    onCleanup(() => {
      editor.destroy();
    });
  });

  return (
    <div
      class="h-full min-h-0 w-full overflow-hidden touch-pan-y"
      data-testid={props.dataTestId}
    >
      <div ref={hostRef} class="h-full min-h-0 w-full touch-pan-y" />
    </div>
  );
}
