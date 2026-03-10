import { FileTree } from "@/components/FileTree";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type CommitReviewFileStatus } from "@/lib/commitReviewStatus";

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

const README_PATCH = `Index: README.md
===================================================================
--- README.md
+++ README.md
@@ -9,27 +9,6 @@
- Tailwind CSS
- shadcn/ui primitives
-
-## Scripts
+## Rich preview demo
-
-\`\`\`bash
-pnpm install
-pnpm run dev
-pnpm run build
-pnpm run lint
-\`\`\`
-
-## Template Manifest
-
-\`\`\`bash
-pnpm run template:export
-\`\`\`
-
+This line was edited to test **markdown rich diff**.
`;

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

const RENAMED_PATCH = `Index: src/new-name.ts
===================================================================
--- src/old-name.ts
+++ src/new-name.ts
@@ -1,3 +1,3 @@
-export const title = "Old Name";
+export const title = "New Name";
 export const enabled = true;
`;

type FixtureFile = {
  status: CommitReviewFileStatus;
  path: string;
  previousPath?: string;
  additions: number;
  deletions: number;
  isMarkdown: boolean;
  richOldContent?: string;
  richNewContent?: string;
  patch?: string;
};

const FIXTURE_FILES: FixtureFile[] = [
  {
    status: "modified",
    path: "README.md",
    additions: 2,
    deletions: 14,
    isMarkdown: true,
    richOldContent: README_OLD,
    richNewContent: README_NEW,
    patch: README_PATCH,
  },
  {
    status: "added",
    path: "docs/quickstart.md",
    additions: 6,
    deletions: 0,
    isMarkdown: true,
    richOldContent: "",
    richNewContent:
      "# Quickstart\n\n- Install deps\n- Run dev\n- Open review mode\n",
    patch: `Index: docs/quickstart.md
===================================================================
--- docs/quickstart.md
+++ docs/quickstart.md
@@ -0,0 +1,6 @@
+# Quickstart
+
+- Install deps
+- Run dev
+- Open review mode
+`,
  },
  {
    status: "renamed",
    path: "src/new-name.ts",
    previousPath: "src/old-name.ts",
    additions: 1,
    deletions: 1,
    isMarkdown: false,
    patch: RENAMED_PATCH,
  },
  {
    status: "deleted",
    path: "components.json",
    additions: 0,
    deletions: 17,
    isMarkdown: false,
    patch: DELETED_PATCH,
  },
];

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

export type CommitReviewVisualMode = "rich" | "patch" | "deleted" | "fallback";

export function CommitReviewVisualFixture({
  mode,
}: {
  mode: CommitReviewVisualMode;
}) {
  const selectedFile =
    mode === "deleted"
      ? "components.json"
      : mode === "fallback"
        ? "src/main.ts"
        : "README.md";

  const activeFile =
    mode === "deleted"
      ? FIXTURE_FILES.find((file) => file.path === "components.json")
      : FIXTURE_FILES.find((file) => file.path === "README.md");

  const canRenderRich = mode === "rich" && activeFile?.isMarkdown;
  const showFallbackBanner = mode === "fallback";

  return (
    <div
      data-testid="commit-review-visual-fixture"
      className="h-screen w-screen overflow-hidden bg-background p-4 text-foreground"
    >
      <div className="grid h-full grid-cols-[240px_minmax(0,1fr)] gap-4">
        <aside className="overflow-hidden rounded border">
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
              selectedFile={
                showFallbackBanner ? activeFile?.path : selectedFile
              }
              folderExpansionStates={[]}
              autoExpandedPaths={["docs", "src"]}
            />
          </div>
        </aside>

        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded border bg-muted/20">
          <div className="flex min-h-0 flex-1 flex-col">
            {activeFile ? (
              <div className="flex min-h-0 flex-1 flex-col">
                {showFallbackBanner ? (
                  <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Current file has no staged diff. Showing{" "}
                    <span className="font-mono text-amber-950">
                      {activeFile.path}
                    </span>{" "}
                    instead.
                  </div>
                ) : null}

                {canRenderRich ? (
                  <div className="border-b px-3 py-2">
                    <ToggleGroup
                      type="single"
                      size="sm"
                      value="rich"
                      className="justify-start"
                    >
                      <ToggleGroupItem
                        value="rich"
                        aria-label="Rich markdown preview"
                        className="h-7 px-2 text-xs"
                      >
                        Rich
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="patch"
                        aria-label="Source patch preview"
                        className="h-7 px-2 text-xs"
                      >
                        Patch
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                ) : null}

                <div className="flex-1 overflow-auto">
                  {canRenderRich ? (
                    <div className="grid gap-3 p-3 md:grid-cols-2">
                      <div className="min-w-0 rounded border bg-background p-3">
                        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300">
                          Before
                        </div>
                        <ProsemarkReadOnly
                          value={activeFile.richOldContent ?? ""}
                          highlightedLineNumbers={[
                            10, 11, 13, 15, 16, 17, 18, 19, 20,
                          ]}
                          lineHighlightTone="remove"
                          className="text-sm leading-6"
                        />
                      </div>
                      <div className="min-w-0 rounded border bg-background p-3">
                        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                          After
                        </div>
                        <ProsemarkReadOnly
                          value={activeFile.richNewContent ?? ""}
                          highlightedLineNumbers={[10, 12]}
                          lineHighlightTone="add"
                          className="text-sm leading-6"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 font-mono text-xs leading-5">
                      {(activeFile.patch ?? "")
                        .split("\n")
                        .map((line, index) => (
                          <div
                            key={`${index}:${line}`}
                            className={`whitespace-pre-wrap rounded-sm px-1 ${getPatchLineClassName(line)}`}
                          >
                            {line.length > 0 ? line : " "}
                          </div>
                        ))}
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
