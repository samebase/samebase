import { onCleanup, onMount } from "solid-js";

const monacoEnvironmentHost = globalThis as typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: () => Worker;
  };
};

async function loadMonaco() {
  const [monaco, , workerModule] = await Promise.all([
    import("monaco-editor/esm/vs/editor/editor.api.js"),
    import("monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js"),
    import("monaco-editor/esm/vs/editor/editor.worker?worker"),
  ]);

  monacoEnvironmentHost.MonacoEnvironment ??= {
    getWorker: () => new workerModule.default(),
  };

  return monaco;
}

export function MonacoSurface(props: {
  dataTestId: string;
  initialValue?: string;
}) {
  let hostRef: HTMLDivElement | undefined;

  onMount(() => {
    if (!hostRef) {
      return;
    }

    let disposed = false;
    let cleanup = () => {};

    void loadMonaco().then((monaco) => {
      if (disposed || !hostRef) {
        return;
      }

      const model = monaco.editor.createModel(
        props.initialValue ?? "",
        "markdown",
      );

      const editor = monaco.editor.create(hostRef, {
        model,
        automaticLayout: true,
        folding: false,
        glyphMargin: false,
        lineNumbers: "off",
        lineDecorationsWidth: 0,
        minimap: {
          enabled: false,
        },
        padding: {
          bottom: 0,
          top: 0,
        },
        renderLineHighlight: "none",
        scrollBeyondLastLine: false,
        scrollbar: {
          alwaysConsumeMouseWheel: false,
          horizontal: "hidden",
          horizontalScrollbarSize: 0,
          vertical: "hidden",
          verticalScrollbarSize: 0,
        },
        tabSize: 2,
        wordWrap: "on",
      });

      const editorDomNode = editor.getDomNode();
      if (editorDomNode) {
        editorDomNode.style.touchAction = "pan-y";
      }

      cleanup = () => {
        editor.dispose();
        model.dispose();
      };
    });

    onCleanup(() => {
      disposed = true;
      cleanup();
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
