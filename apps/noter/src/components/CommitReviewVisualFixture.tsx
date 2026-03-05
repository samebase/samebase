import { FileTree } from "@/components/FileTree";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";

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

export type CommitReviewVisualMode = "rich" | "patch" | "deleted";

export function CommitReviewVisualFixture({
  mode,
}: {
  mode: CommitReviewVisualMode;
}) {
  const selectedFile = mode === "deleted" ? "components.json" : "README.md";
  const selectedStatus = mode === "deleted" ? "deleted" : "modified";
  const selectedPatch = mode === "deleted" ? DELETED_PATCH : README_PATCH;

  return (
    <div
      data-testid="commit-review-visual-fixture"
      className="h-screen w-screen overflow-hidden bg-background text-foreground p-4"
    >
      <div className="grid h-full grid-cols-[240px_minmax(0,1fr)] gap-4">
        <aside className="rounded border overflow-hidden">
          <div className="border-b px-3 py-2 text-xs text-muted-foreground">
            Fixture Tree
          </div>
          <div className="overflow-auto">
            <FileTree
              items={[
                {
                  path: ".gitignore",
                  originalPath: ".gitignore",
                  type: "blob",
                  deleted: false,
                },
                {
                  path: "README.md",
                  originalPath: "README.md",
                  type: "blob",
                  deleted: false,
                },
                {
                  path: "components.json",
                  originalPath: "components.json",
                  type: "blob",
                  deleted: true,
                },
              ]}
              selectedFile={selectedFile}
              folderExpansionStates={[]}
            />
          </div>
        </aside>

        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded border bg-muted/20">
          <div className="border-b px-3 py-2 text-xs text-muted-foreground">
            Branch: <span className="font-mono text-foreground">main</span> · 2
            files ·{" "}
            <span className="text-emerald-600 dark:text-emerald-400">+2</span> /{" "}
            <span className="text-rose-600 dark:text-rose-400">-40</span> ·
            includes deletions
          </div>

          <div className="border-b px-3 py-2">
            <div className="mb-2 text-xs text-muted-foreground">
              <span className="font-mono text-foreground">
                {selectedStatus === "deleted" ? "D" : "M"} {selectedFile}
              </span>
              {" · "}
              <span className="text-emerald-600 dark:text-emerald-400">+2</span>
              {" / "}
              <span className="text-rose-600 dark:text-rose-400">-40</span>
            </div>
            <ToggleGroup
              type="single"
              size="sm"
              value={mode === "rich" ? "rich" : "patch"}
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

          <div className="flex-1 overflow-auto">
            {mode === "rich" ? (
              <div className="grid gap-3 p-3 md:grid-cols-2">
                <div className="min-w-0 rounded border bg-background p-3">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300">
                    Before
                  </div>
                  <ProsemarkReadOnly
                    value={README_OLD}
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
                    value={README_NEW}
                    highlightedLineNumbers={[10, 12]}
                    lineHighlightTone="add"
                    className="text-sm leading-6"
                  />
                </div>
              </div>
            ) : (
              <div className="p-3 font-mono text-xs leading-5">
                {selectedPatch.split("\n").map((line, index) => (
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
        </section>
      </div>
    </div>
  );
}
