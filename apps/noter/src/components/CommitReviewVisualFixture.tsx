import { FileTree } from "@/components/FileTree";
import {
  ProsemarkMergeEditor,
  type ProsemarkMergeEditorOptions,
} from "@/components/ProsemarkMergeEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const README_OLD = `# Noter Starter Template

This project is the seeded baseline for newly created noter-managed repositories.

## Stack

- React + Vite
- Convex backend
- Tailwind CSS
- shadcn/ui primitives

## Scripts

\`\`\`bash
pnpm install
pnpm run dev
pnpm run build
pnpm run lint
\`\`\`

## Template Manifest

\`\`\`bash
pnpm run template:export
\`\`\`
`;

const README_NEW = `# Noter Starter Template

This project is the seeded baseline for newly created noter-managed repositories.

## Stack

- React + Vite
- Convex backend
- Tailwind CSS
- shadcn/ui primitives

## Rich preview demo

This line was edited to test **markdown rich diff**.
`;

const AGENTS_CONTENT = `# AGENTS.md

- Keep the review surface flush with the standard editor.
- Do not switch files when the selected file has no staged changes.
- Use the same editor footprint for diff and non-diff markdown views.
`;

const LINKS_OLD = `# Links

- https://automerge.org/ from https://stack.convex.dev/automerge-and-convex
- https://www.blacksmith.sh/
- https://x.com/matteocollina/status/2033590124919787819`;

const LINKS_NEW = `${LINKS_OLD}
- https://tree.md/`;

const DELETED_PATCH = `Index: components.json
===================================================================
--- components.json
+++ components.json
@@ -1,17 +0,0 @@
-{
-  "$schema": "https://ui.shadcn.com/schema.json",
-  "style": "new-york",
-  "rsc": false,
-  "tsx": true,
-  "tailwind": {
-    "config": "tailwind.config.js",
-    "css": "src/index.css",
-    "baseColor": "slate",
-    "cssVariables": true,
-    "prefix": ""
-  },
-  "aliases": {
-    "components": "@/components",
-    "utils": "@/lib/utils"
-  }
-}
`;

const CONFLICT_OURS = `# TODO

- [ ] review Observable
- [ ] void.cloud
- [ ] Tuple
`;

const CONFLICT_UPSTREAM = `# TODO

- [ ] review Observable
- [ ] bootstrap examples
- [ ] Tuple
- [ ] agent graph polish
`;

const CONFLICT_BASE_TO_OURS_PATCH = `Index: TODO.md
===================================================================
--- TODO.md
+++ TODO.md
@@ -1,4 +1,4 @@
 # TODO
 
 - [ ] review Observable
-- [ ] bootstrap examples
+- [ ] void.cloud
 - [ ] Tuple
`;

const CONFLICT_BASE_TO_UPSTREAM_PATCH = `Index: TODO.md
===================================================================
--- TODO.md
+++ TODO.md
@@ -1,4 +1,5 @@
 # TODO
 
 - [ ] review Observable
 - [ ] bootstrap examples
 - [ ] Tuple
+- [ ] agent graph polish
`;

type FixtureFile = {
  path: string;
  previousPath?: string;
  isMarkdown: boolean;
  richOldContent?: string;
  richNewContent?: string;
  patch?: string;
};

const FIXTURE_FILES: FixtureFile[] = [
  {
    path: "README.md",
    isMarkdown: true,
    richOldContent: README_OLD,
    richNewContent: README_NEW,
  },
  {
    path: "components.json",
    isMarkdown: false,
    patch: DELETED_PATCH,
  },
];

const INLINE_FIXTURE_OPTIONS = {
  allowInlineDiffs: false,
  syntaxHighlightDeletions: true,
} satisfies ProsemarkMergeEditorOptions;

function getPatchLineClassName(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  if (line.startsWith("@@")) {
    return "text-muted-foreground";
  }
  return "";
}

export type CommitReviewVisualMode =
  | "inline"
  | "deleted"
  | "deleted-markdown-link"
  | "trailing-newline-only"
  | "unchanged"
  | "conflict";

function renderPatchLines(patch: string) {
  return patch.split("\n").map((line, index) => (
    <div
      key={`${index}:${line}`}
      className={`whitespace-pre-wrap corner-notch-1 px-1 ${getPatchLineClassName(line)}`}
    >
      {line.length > 0 ? line : " "}
    </div>
  ));
}

export function CommitReviewVisualFixture({
  mode,
}: {
  mode: CommitReviewVisualMode;
}) {
  let selectedFile = "README.md";
  let activeFile = FIXTURE_FILES.find((file) => file.path === "README.md");

  switch (mode) {
    case "conflict":
      selectedFile = "TODO.md";
      activeFile = {
        path: "TODO.md",
        isMarkdown: true,
      };
      break;
    case "deleted-markdown-link":
      selectedFile = "links.md";
      activeFile = {
        path: "links.md",
        isMarkdown: true,
        richOldContent: LINKS_OLD,
        richNewContent: LINKS_NEW,
      };
      break;
    case "trailing-newline-only":
      selectedFile = "links.md";
      activeFile = {
        path: "links.md",
        isMarkdown: true,
        richOldContent: LINKS_OLD,
        richNewContent: `${LINKS_OLD}\n`,
      };
      break;
    case "deleted":
      selectedFile = "components.json";
      activeFile = FIXTURE_FILES.find(
        (file) => file.path === "components.json",
      );
      break;
    case "unchanged":
      selectedFile = "AGENTS.md";
      activeFile = {
        path: "AGENTS.md",
        isMarkdown: true,
        richOldContent: AGENTS_CONTENT,
        richNewContent: AGENTS_CONTENT,
      };
      break;
    case "inline":
      break;
  }

  const canRenderInline = Boolean(
    activeFile &&
      (typeof activeFile.richOldContent === "string" ||
        typeof activeFile.richNewContent === "string"),
  );

  return (
    <div
      data-testid="commit-review-visual-fixture"
      className="h-screen w-screen overflow-hidden bg-background p-4 text-foreground"
    >
      <div className="grid h-full grid-cols-[240px_minmax(0,1fr)] gap-4">
        <aside className="overflow-hidden corner-notch-1 border">
          <div className="border-b px-3 py-2 text-xs text-muted-foreground">
            Sidebar
          </div>
          <div className="border-b px-3 py-2">
            <ToggleGroup
              type="single"
              size="sm"
              value="changes"
              className="justify-start"
            >
              <ToggleGroupItem
                value="simple"
                aria-label="Simple View"
                className="h-7 px-2 text-xs"
              >
                Simple View
              </ToggleGroupItem>
              <ToggleGroupItem
                value="all"
                aria-label="All Files"
                className="h-7 px-2 text-xs"
              >
                All Files
              </ToggleGroupItem>
              <ToggleGroupItem
                value="changes"
                aria-label="Changes"
                className="h-7 px-2 text-xs"
              >
                Changes
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="overflow-auto">
            <FileTree
              items={[
                {
                  path: "README.md",
                  originalPath: "README.md",
                  type: "blob",
                  deleted: false,
                  status: "modified",
                },
                {
                  path: "TODO.md",
                  originalPath: "TODO.md",
                  type: "blob",
                  deleted: false,
                  status: "modified",
                },
                {
                  path: "docs/quickstart.md",
                  originalPath: "docs/quickstart.md",
                  type: "blob",
                  deleted: false,
                  status: "added",
                },
                {
                  path: "src/new-name.ts",
                  originalPath: "src/old-name.ts",
                  type: "blob",
                  deleted: false,
                  status: "renamed",
                },
                {
                  path: "components.json",
                  originalPath: "components.json",
                  type: "blob",
                  deleted: true,
                  status: "deleted",
                },
              ]}
              selectedFile={selectedFile}
              folderExpansionStates={[]}
              autoExpandedPaths={["docs", "src"]}
            />
          </div>
        </aside>

        <section className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col">
            {activeFile ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 overflow-auto">
                  {mode === "conflict" ? (
                    <div className="min-h-full">
                      <div className="border-b border-amber-200 bg-amber-50 px-3 py-3">
                        <div className="text-sm font-medium text-amber-950">
                          Commit blocked by upstream changes in TODO.md
                        </div>
                        <div className="mt-1 text-xs text-amber-900/80">
                          Review the conflict patches below, then rebase staging
                          onto the latest GitHub state before editing a manual
                          resolution.
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button size="sm" className="h-7 px-2 text-xs">
                            Rebase onto latest GitHub
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                          >
                            Copy conflict bundle
                          </Button>
                        </div>
                        <div className="mt-2 text-[11px] text-amber-950/70">
                          Base blob: base-sha Upstream blob: upstream-sha
                        </div>
                      </div>
                      <div className="grid min-h-0 md:grid-cols-2 md:divide-x">
                        <div className="min-h-0">
                          <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                            Base -&gt; Yours
                          </div>
                          <div className="p-3 font-mono text-xs leading-5">
                            {renderPatchLines(CONFLICT_BASE_TO_OURS_PATCH)}
                          </div>
                        </div>
                        <div className="min-h-0 border-t md:border-t-0">
                          <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                            Base -&gt; Upstream
                          </div>
                          <div className="p-3 font-mono text-xs leading-5">
                            {renderPatchLines(CONFLICT_BASE_TO_UPSTREAM_PATCH)}
                          </div>
                        </div>
                      </div>
                      <div className="border-t px-3 py-2 text-xs font-medium text-muted-foreground">
                        Resolved result after rebase
                      </div>
                      <ProsemarkMergeEditor
                        value={CONFLICT_OURS}
                        baseValue={CONFLICT_UPSTREAM}
                        options={INLINE_FIXTURE_OPTIONS}
                        editable
                        className="text-sm leading-6"
                      />
                    </div>
                  ) : canRenderInline ? (
                    <div className="min-h-full">
                      <div className="border-b px-3 py-2">
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="fixture-inline-option-show-patch"
                              checked={false}
                              disabled
                            />
                            <Label
                              htmlFor="fixture-inline-option-show-patch"
                              className="text-xs font-medium text-muted-foreground"
                            >
                              Show patch
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="fixture-inline-option-allow-inline-diffs"
                              checked={INLINE_FIXTURE_OPTIONS.allowInlineDiffs}
                              disabled
                            />
                            <Label
                              htmlFor="fixture-inline-option-allow-inline-diffs"
                              className="text-xs font-medium text-muted-foreground"
                            >
                              Inline diffs
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="fixture-inline-option-syntax-deletions"
                              checked={
                                INLINE_FIXTURE_OPTIONS.syntaxHighlightDeletions
                              }
                              disabled
                            />
                            <Label
                              htmlFor="fixture-inline-option-syntax-deletions"
                              className="text-xs font-medium text-muted-foreground"
                            >
                              Syntax deleted
                            </Label>
                          </div>
                        </div>
                      </div>
                      <ProsemarkMergeEditor
                        value={activeFile.richNewContent ?? ""}
                        baseValue={activeFile.richOldContent ?? ""}
                        options={INLINE_FIXTURE_OPTIONS}
                        editable
                        className="text-sm leading-6"
                      />
                    </div>
                  ) : (
                    <div className="p-3 font-mono text-xs leading-5">
                      {renderPatchLines(activeFile.patch ?? "")}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
