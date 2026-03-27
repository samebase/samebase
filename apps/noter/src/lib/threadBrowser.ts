export type ThreadBrowserMode = "active" | "archived";

export type ThreadBrowserDetailState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "archived"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready" };

export type ThreadBrowserItem = {
  id: string | null;
  type: string;
  summary: string | null;
  text: string | null;
};

export type ThreadBrowserTurn = {
  id: string;
  status: string;
  errorMessage: string | null;
  items: ThreadBrowserItem[];
};

export type ThreadBrowserProject = {
  id: string;
  label: string;
  rootPath: string;
};

export type ThreadBrowserWorkspace = {
  label: string | null;
  isProjectRoot: boolean;
};

export type ThreadBrowserThread = {
  id: string;
  title: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  sourceLabel: string;
  statusLabel: string;
  branch: string | null;
  cwd: string;
  path: string | null;
  isArchived: boolean;
  project: ThreadBrowserProject;
  workspace: ThreadBrowserWorkspace;
  turns: ThreadBrowserTurn[];
};

export type ThreadBrowserGroup = {
  id: string;
  label: string;
  detail: string;
  count: number;
  loadedCount: number;
  threads: ThreadBrowserThread[];
};
