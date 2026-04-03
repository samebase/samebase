import { SidebarProvider } from "@/components/sidebar";
import { MachinesWorkspaceThreadRow } from "@/components/MachinesWorkspaceView";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
import type { CodexThreadSidebarThread } from "@/lib/codexThreadSidebar";
import { Pin } from "lucide-react";

export type MachinesWorkspaceThreadRowVisualMode =
  | "machines-thread-row"
  | "machines-thread-row-ready"
  | "machines-thread-row-draft";

const FIXTURE_RELATIVE_TIME_REFERENCE_MS = 1_775_546_200_000;

const REFERENCE_THREAD: CodexAppServerThread = {
  agentNickname: null,
  agentRole: null,
  cliVersion: "0.117.0-alpha.10",
  createdAt: 1_775_542_840_000,
  cwd: "/Users/fixture/.codex/worktrees/demo/noter",
  gitInfo: {
    branch: "codex/remote-streaming",
    originUrl: "git@github.com:fixture/noter.git",
    sha: "abc123def4567890abc123def4567890abc123de",
  },
  id: "thread-machine-workspace-reference-row",
  modelProvider: "openai",
  name: "Describe remote Codex streaming",
  path: "/Users/fixture/.codex/sessions/2026/04/03/reference-row.jsonl",
  preview: "Describe remote Codex streaming",
  project: {
    id: "/Users/fixture/dev/noter",
    label: "noter",
    rootCwd: "/Users/fixture/dev/noter",
  },
  raw: null,
  source: "vscode",
  sourceLabel: "vscode",
  status: {
    activeFlags: [],
    raw: { type: "idle" },
    type: "idle",
  },
  turns: [],
  updatedAt: FIXTURE_RELATIVE_TIME_REFERENCE_MS - 56 * 60 * 1000,
  workspace: {
    isProjectRoot: true,
    label: null,
  },
};

const REFERENCE_ROW: CodexThreadSidebarThread = {
  id: REFERENCE_THREAD.id,
  isLoaded: true,
  isPinned: true,
  showWorkspaceIndicator: false,
  title: "Describe remote Codex streaming",
  thread: REFERENCE_THREAD,
  workspaceLabel: null,
  workspaceTooltip: null,
};

export function MachinesWorkspaceThreadRowVisualFixture({
  mode = "machines-thread-row",
}: {
  mode?: MachinesWorkspaceThreadRowVisualMode;
}) {
  const trailingIndicators =
    mode === "machines-thread-row-draft"
      ? (["worktree", "prDraft"] as const)
      : mode === "machines-thread-row-ready"
        ? (["worktree", "prReady"] as const)
        : (["worktree"] as const);

  return (
    <SidebarProvider
      className="w-[842px]"
      defaultLeftDesktopWidthPx={842}
      defaultLeftMobileWidthPx={842}
      defaultOpen
    >
      <div
        data-testid="machines-thread-row-visual-fixture"
        className="h-16 w-[842px] overflow-hidden bg-white"
      >
        <MachinesWorkspaceThreadRow
          dataTestId="machines-thread-row-visual-fixture-row"
          forceShowTrailingMeta
          isSelected={false}
          item={REFERENCE_ROW}
          leadingIcon={
            <Pin className="h-[18px] w-[18px] rotate-45" strokeWidth={1.65} />
          }
          metaCounts={{
            added: 316,
            removed: 0,
          }}
          pinActionPendingKey={null}
          relativeTimeReferenceMs={FIXTURE_RELATIVE_TIME_REFERENCE_MS}
          trailingIndicators={[...trailingIndicators]}
          threadKey="reference-row"
          visualVariant="reference"
        />
      </div>
    </SidebarProvider>
  );
}
