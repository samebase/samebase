/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable prefer-const */
import { useRef, useEffect, useState } from "react";
import { ChangeSet, Compartment } from "@codemirror/state";
import { EditorView } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { keymap, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { useTheme } from "next-themes";
import {
  collab,
  getSyncedVersion,
  receiveUpdates,
  sendableUpdates,
  Update,
} from "@codemirror/collab";
import { client } from "@/main";
import { api } from "../../convex/_generated/api";
import { prosemarkBaseThemeSetup, prosemarkBasicSetup } from "@prosemark/core";
import { printTree } from "@lezer-unofficial/printer";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { GetFunctionReferenceReturnType } from "@/lib/convexUtils";
import { getProsemarkFileThemeExtensions } from "@/components/prosemarkSurface";
import { Id } from "../../convex/_generated/dataModel";
import { type GithubTreeType } from "convex/schema";
import { MonacoEditor } from "./MonacoEditor";
import { useProsemarkMobilePaneDrag } from "@/components/useProsemarkMobilePaneDrag";
import {
  getCodeMirrorFileLanguageKind,
  getInitialCodeMirrorLanguageExtension,
  loadCodeMirrorLanguageExtension,
} from "@/lib/codemirrorLanguage";
import { fileCodeMirrorBaseExtensions } from "@/lib/fileCodeMirrorBaseExtensions";

// Temporary:
// const tempVaultId = "k976ryb9d1m2gyvxhps87dac257mv5ps" as Id<"vaults">;
// const tempFilePath = "README.md";

function awaitTimeout(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeout);
  });
}

const delay = 500;

async function pushUpdates({
  version,
  repositoryFullName,
  branch,
  filePath,
  fullUpdates,
}: {
  version: number;
  repositoryFullName: string;
  branch: string;
  filePath: string;
  fullUpdates: readonly Update[];
}): Promise<boolean> {
  await awaitTimeout(delay);
  // Strip off transaction data
  let updates = fullUpdates.map((u) => ({
    clientId: u.clientID,
    changes: JSON.stringify(u.changes.toJSON()),
  }));

  return client
    .mutation(api.collaborative.pushUpdates, {
      repositoryFullName,
      branch,
      filePath,
      version,
      updates,
    })
    .then((result) => result.success);
}

// https://github.com/codemirror/website/blob/main/site/examples/collab/collab.ts#L89
function peerExtension({
  startVersion,
  repositoryFullName,
  branch,
  filePath,
  setVersion,
  setPull,
  setSyncError,
}: {
  startVersion: number;
  repositoryFullName: string;
  branch: string;
  filePath: string;
  setVersion: (version: number) => void;
  setPull: (
    pull: (updates: readonly Update[], version: number) => void,
  ) => void;
  setSyncError: (error: string | null) => void;
}) {
  let plugin = ViewPlugin.fromClass(
    class {
      private pushing = false;
      private done = false;
      private retryTimer: number | null = null;

      private isDestroyed(): boolean {
        return this.done;
      }

      constructor(private view: EditorView) {
        // this.pull();
        setPull(this.pull.bind(this));
      }

      update(update: ViewUpdate) {
        if (!this.isDestroyed() && update.docChanged) {
          void this.push();
        }
      }

      async push() {
        if (this.isDestroyed()) return;
        let updates = sendableUpdates(this.view.state);

        if (this.pushing || !updates.length) return;
        this.pushing = true;
        let version = getSyncedVersion(this.view.state);
        if (this.isDestroyed()) return;
        setVersion(version);

        let retryDelayMs = 100;
        try {
          const success = await pushUpdates({
            version,
            repositoryFullName,
            branch,
            filePath,
            fullUpdates: updates,
          });

          if (success) {
            if (!this.isDestroyed()) {
              setSyncError(null);
            }
          } else {
            retryDelayMs = 200;
            if (!this.isDestroyed()) {
              setSyncError("Syncing latest remote changes...");
            }
          }
        } catch (error) {
          retryDelayMs = 1000;
          const message =
            error instanceof Error && error.message.length > 0
              ? error.message
              : "Failed to sync edits. Retrying...";
          if (!this.isDestroyed()) {
            setSyncError(message);
          }
          console.error("Failed to push collaborative editor updates:", error);
        } finally {
          this.pushing = false;
        }
        // Regardless of whether the push failed or new updates came in
        // while it was running, try again if there's updates remaining
        if (!this.isDestroyed() && sendableUpdates(this.view.state).length) {
          this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            if (!this.isDestroyed()) {
              void this.push();
            }
          }, retryDelayMs);
        }
      }

      async pull(updates: readonly Update[], incomingVersion: number) {
        if (this.isDestroyed()) return;
        let version = getSyncedVersion(this.view.state);
        if (version !== incomingVersion) return;

        // let updates = await pullUpdates({
        //   version,
        //   repositoryFullName,
        //   filePath,
        // });
        this.view.dispatch(receiveUpdates(this.view.state, updates));

        const newVersion = getSyncedVersion(this.view.state);
        if (!this.isDestroyed()) {
          setVersion(newVersion);
        }
      }

      destroy() {
        this.done = true;
        if (this.retryTimer !== null) {
          window.clearTimeout(this.retryTimer);
          this.retryTimer = null;
        }
      }
    },
  );
  return [collab({ startVersion }), plugin];
}

// Prose files: use ProseMark/CodeMirror. Everything else: Monaco.
const PROSE_EXTENSIONS = new Set(["md", "mdx", "mdc", "txt", "markdown"]);
type CodeEditorOverride = "default" | "codemirror";

function isProseFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  // Default to prose if no extension (or unknown)
  return !ext || PROSE_EXTENSIONS.has(ext);
}

function shouldUseCodeMirrorEditor(args: {
  filePath: string;
  editorOverride: CodeEditorOverride;
}) {
  return args.editorOverride === "codemirror" || isProseFile(args.filePath);
}

export function CodeEditorWrapper({
  repositoryFullName,
  branch,
  filePath,
  stagedFile,
  vaultId,
  tree,
  treeSHA,
  showMobileLineNumbers = false,
  editorOverride = "default",
}: {
  repositoryFullName: string;
  branch: string;
  filePath: string;
  stagedFile: NonNullable<
    GetFunctionReferenceReturnType<typeof api.fileStaging.getByNewPath>
  >;
  vaultId: Id<"vaults">;
  tree: GithubTreeType[];
  treeSHA: string;
  showMobileLineNumbers?: boolean;
  editorOverride?: CodeEditorOverride;
}) {
  if (shouldUseCodeMirrorEditor({ filePath, editorOverride })) {
    return (
      <CodeEditor
        key={`${repositoryFullName}-${branch}-${filePath}`}
        firstDoc={stagedFile}
        repositoryFullName={repositoryFullName}
        branch={branch}
        filePath={filePath}
      />
    );
  }

  return (
    <MonacoEditor
      key={`${repositoryFullName}-${branch}-${filePath}`}
      firstDoc={stagedFile}
      repositoryFullName={repositoryFullName}
      branch={branch}
      filePath={filePath}
      vaultId={vaultId}
      tree={tree}
      treeSHA={treeSHA}
      showMobileLineNumbers={showMobileLineNumbers}
    />
  );
}

export function CodeEditor({
  firstDoc,
  repositoryFullName,
  branch,
  filePath,
}: {
  firstDoc: { version: number; content: string };
  repositoryFullName: string;
  branch: string;
  filePath: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pendingLanguageLoadRef = useRef<symbol | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const pullRef = useRef<
    ((updates: readonly Update[], version: number) => void) | null
  >(null);
  const { theme, systemTheme } = useTheme();
  const [version, setVersion] = useState(firstDoc.version);
  const [syncError, setSyncError] = useState<string | null>(null);
  const mobilePaneDrag = useProsemarkMobilePaneDrag(true, containerRef);

  const updates = useQuery(
    api.collaborative.pullUpdates,
    {
      repositoryFullName,
      branch,
      filePath,
      version,
    },
    {
      dontCache: true,
    },
  );

  useEffect(() => {
    if (!updates || !pullRef.current) return;

    const cmUpdates = updates.map((u: (typeof updates)[number]) => ({
      changes: ChangeSet.fromJSON(JSON.parse(u.changes)),
      clientID: u.clientID,
    }));
    pullRef.current(cmUpdates, version);
    // `version` must stay coupled to the fetched `updates` batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updates]);

  useEffect(() => {
    let editor: EditorView | null = null;
    const languageLoadKey = Symbol("code-editor-language-load");
    const languageCompartment = new Compartment();

    const func = async () => {
      if (!editorRef.current) return;

      // Determine if we should use dark theme
      const effectiveTheme = theme === "system" ? systemTheme : theme;
      const isDark = effectiveTheme === "dark";
      const languageKind = getCodeMirrorFileLanguageKind(filePath);

      // editor = createProseMarkEditor({
      //   content: firstDoc.content,
      //   version: firstDoc.version,
      //   parent: editorRef.current,
      //   isDark,
      //   repositoryFullName,
      //   filePath,
      // });

      // Custom basic setup without line numbers and with minimal borders

      const extensions = [
        ...fileCodeMirrorBaseExtensions,
        languageCompartment.of(getInitialCodeMirrorLanguageExtension(filePath)),
        prosemarkBasicSetup(),
        prosemarkBaseThemeSetup(),
        themeCompartmentRef.current.of(
          getProsemarkFileThemeExtensions({ isDark, languageKind }),
        ),
        peerExtension({
          startVersion: firstDoc.version,
          repositoryFullName,
          branch,
          filePath,
          setVersion,
          setSyncError,
          setPull: (pull) => {
            pullRef.current = pull;
          },
        }),

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

      editor = new EditorView({
        extensions,
        doc: firstDoc.content,
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

    void func();
    // Cleanup function
    return () => {
      console.log("Cleaning up editor");
      if (pendingLanguageLoadRef.current === languageLoadKey) {
        pendingLanguageLoadRef.current = null;
      }
      editor?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]); // Re-create only when the routed file changes; theme updates reconfigure in place below.

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const effectiveTheme = theme === "system" ? systemTheme : theme;
    const isDark = effectiveTheme === "dark";
    const languageKind = getCodeMirrorFileLanguageKind(filePath);
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(
        getProsemarkFileThemeExtensions({ isDark, languageKind }),
      ),
    });
  }, [filePath, systemTheme, theme]);

  useEffect(() => {
    setSyncError(null);
  }, [repositoryFullName, branch, filePath]);

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 w-full"
      style={{ touchAction: mobilePaneDrag.touchAction }}
      {...mobilePaneDrag.containerProps}
    >
      <div
        ref={editorRef}
        className="notranslate h-full min-h-0 w-full"
        translate="no"
      />
      {syncError ? (
        <div className="pointer-events-none absolute bottom-2 right-2 corner-notch-1 bg-red-600/90 px-2 py-1 text-[11px] text-white">
          {syncError}
        </div>
      ) : null}
    </div>
  );
}
