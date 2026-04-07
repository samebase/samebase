import {
  filterSimpleViewTreeItems,
  hasSimpleViewConfigFile,
  hasStagedSimpleViewConfigFile,
  isStagedSimpleViewConfigDeleted,
  parseSimpleViewConfig,
  shouldLoadRepositorySimpleViewConfig,
} from "@/lib/simpleView";

export type SimpleViewVisualMode =
  | "simple-repository-config"
  | "simple-missing-config";

type TreeItem = {
  path: string;
  type: "tree" | "blob";
};

type StagedNoterFile = {
  fileDeleted: boolean;
  content: string;
} | null;

const FIXTURE_TREE: TreeItem[] = [
  { path: "AGENTS.md", type: "blob" },
  { path: "README.md", type: "blob" },
  { path: "noter.md", type: "blob" },
  { path: "src", type: "tree" },
  { path: "src/App.tsx", type: "blob" },
  { path: "src/main.tsx", type: "blob" },
  { path: "convex", type: "tree" },
  { path: "convex/schema.ts", type: "blob" },
];

const REPOSITORY_NOTER_CONTENT = `---
simpleView:
  exclude:
    - src/**
    - convex/**
---

# noter.md
`;

function listVisibleFiles(tree: TreeItem[]): string[] {
  return tree
    .filter((item) => item.type === "blob")
    .map((item) => item.path)
    .sort((left, right) => left.localeCompare(right));
}

function computeFixture(mode: SimpleViewVisualMode): {
  title: string;
  stagedNoterFile: StagedNoterFile;
  repositoryNoterContent: string | null;
  didAttemptRepositoryLoad: boolean;
} {
  if (mode === "simple-repository-config") {
    return {
      title: "Repository noter.md fallback (not staged)",
      stagedNoterFile: null,
      repositoryNoterContent: REPOSITORY_NOTER_CONTENT,
      didAttemptRepositoryLoad: true,
    };
  }

  return {
    title: "No noter.md config found",
    stagedNoterFile: null,
    repositoryNoterContent: null,
    didAttemptRepositoryLoad: true,
  };
}

export function SimpleViewVisualFixture({
  mode,
}: {
  mode: SimpleViewVisualMode;
}) {
  const fixture = computeFixture(mode);
  const hasStagedNoterFile = hasStagedSimpleViewConfigFile(
    fixture.stagedNoterFile,
  );
  const hasNoterConfigFile = hasSimpleViewConfigFile(
    fixture.stagedNoterFile,
    fixture.repositoryNoterContent,
  );
  const shouldLoadRepositoryNoterFile = shouldLoadRepositorySimpleViewConfig(
    fixture.stagedNoterFile,
    fixture.didAttemptRepositoryLoad,
  );

  const noterConfigContent = isStagedSimpleViewConfigDeleted(
    fixture.stagedNoterFile,
  )
    ? null
    : hasStagedSimpleViewConfigFile(fixture.stagedNoterFile)
      ? fixture.stagedNoterFile.content
      : fixture.repositoryNoterContent;
  const simpleViewConfig = parseSimpleViewConfig(noterConfigContent);
  const simpleViewMode = hasNoterConfigFile ? "simple" : "all";
  const visibleTreeData =
    simpleViewMode === "simple" &&
    simpleViewConfig.hasValidConfig &&
    simpleViewConfig.excludePatterns.length > 0
      ? filterSimpleViewTreeItems(
          FIXTURE_TREE,
          simpleViewConfig.excludePatterns,
        )
      : FIXTURE_TREE;

  const visibleFiles = listVisibleFiles(visibleTreeData);
  const allFiles = listVisibleFiles(FIXTURE_TREE);

  return (
    <div
      data-testid="simple-view-visual-fixture"
      className="min-h-screen bg-slate-100 p-8 text-slate-900"
    >
      <div className="mx-auto max-w-5xl corner-notch-1 border border-slate-300 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Simple View Visual Fixture</h1>
        <p className="mt-1 text-sm text-slate-600">{fixture.title}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-700 md:grid-cols-4">
          <div className="corner-notch-1 border border-slate-200 bg-slate-50 p-2">
            mode: <span className="font-medium">{simpleViewMode}</span>
          </div>
          <div className="corner-notch-1 border border-slate-200 bg-slate-50 p-2">
            has staged noter.md:{" "}
            <span className="font-medium">{String(hasStagedNoterFile)}</span>
          </div>
          <div className="corner-notch-1 border border-slate-200 bg-slate-50 p-2">
            has config file:{" "}
            <span className="font-medium">{String(hasNoterConfigFile)}</span>
          </div>
          <div className="corner-notch-1 border border-slate-200 bg-slate-50 p-2">
            should load repository noter.md:{" "}
            <span className="font-medium">
              {String(shouldLoadRepositoryNoterFile)}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <section className="corner-notch-1 border border-slate-200 p-3">
            <h2 className="text-sm font-medium">All Files</h2>
            <ul className="mt-2 space-y-1 font-mono text-xs text-slate-700">
              {allFiles.map((filePath) => (
                <li key={filePath}>{filePath}</li>
              ))}
            </ul>
          </section>

          <section className="corner-notch-1 border border-slate-200 p-3">
            <h2 className="text-sm font-medium">Visible Files</h2>
            <ul className="mt-2 space-y-1 font-mono text-xs text-slate-700">
              {visibleFiles.map((filePath) => (
                <li key={filePath}>{filePath}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
