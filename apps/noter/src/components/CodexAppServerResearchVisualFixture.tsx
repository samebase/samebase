import { ConnectedMachineHeartbeatLogSection } from "@/components/ConnectedMachineHeartbeatLog";
import { CodexAppServerSelectedThreadCard } from "@/components/CodexAppServerResearchPage";
import {
  type CodexAppServerThread,
  type CodexAppServerThreadTurn,
} from "@/lib/codexAppServerResearch";

export type CodexAppServerResearchVisualMode = "codex-app-server-research";

const FIXTURE_TURN: CodexAppServerThreadTurn = {
  id: "turn-fixture-research",
  status: "completed",
  errorMessage: null,
  items: [
    {
      id: "item-fixture-user-research",
      type: "userMessage",
      summary:
        "The browser research page already covers inventory browsing, so the protocol lab should stay focused on one selected thread and action controls.",
      raw: {
        text: "The browser research page already covers inventory browsing, so the protocol lab should stay focused on one selected thread and action controls.",
      },
    },
    {
      id: "item-fixture-agent-research",
      type: "agentMessage",
      summary:
        "Keep the full thread detail visible here, but move list navigation over to the dedicated browser view so the page stops wasting horizontal space.",
      raw: {
        text: "Keep the full thread detail visible here, but move list navigation over to the dedicated browser view so the page stops wasting horizontal space.",
      },
    },
  ],
  raw: null,
};

const FIXTURE_THREAD: CodexAppServerThread = {
  id: "thread-research-selected",
  name: "Connected machines thread sync follow-up",
  preview:
    "We already have the dedicated browser view for thread discovery, so the research page should keep only the selected thread detail and controls.",
  cwd: "/workspace/noter",
  project: {
    id: "project:noter",
    label: "noter",
    rootCwd: "/workspace/noter",
  },
  workspace: {
    label: "research",
    isProjectRoot: false,
  },
  createdAt: 1_775_379_420,
  updatedAt: 1_775_380_260,
  cliVersion: "0.117.0-alpha.10",
  modelProvider: "openai",
  sourceLabel: "vscode",
  source: "vscode",
  status: {
    type: "idle",
    activeFlags: [],
    raw: { type: "idle" },
  },
  gitInfo: {
    branch: "codex/connected-machine-followup",
    originUrl: "git@github.com:noter-md/noter.git",
    sha: "f4b9f7280a4bc7a74f3de83f7afc3d62f14f17f8",
  },
  path: "/workspace/.codex/sessions/2026/03/31/research-thread-selected.jsonl",
  agentNickname: null,
  agentRole: null,
  turns: [FIXTURE_TURN],
  raw: null,
};

export function CodexAppServerResearchVisualFixture({
  mode,
}: {
  mode: CodexAppServerResearchVisualMode;
}) {
  mode satisfies CodexAppServerResearchVisualMode;

  return (
    <div className="bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.18),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] p-8 text-slate-950">
      <div
        data-testid="codex-app-server-research-visual-fixture"
        className="grid w-[1240px] gap-6"
      >
        <ConnectedMachineHeartbeatLogSection
          heartbeatLog={`[10:20:00 AM] observing Research MacBook Pro (research-mbp.local); last ping seen, currently online.
[10:20:15 AM] heartbeat from Research MacBook Pro (research-mbp.local).
[10:20:30 AM] heartbeat from Research MacBook Pro (research-mbp.local).`}
        />
        <CodexAppServerSelectedThreadCard
          threadsCount={24}
          hasMoreThreads
          browserViewHref="/research/codex-app-server/browser?threadId=thread-research-selected"
          thread={FIXTURE_THREAD}
          selectedThreadId={FIXTURE_THREAD.id}
          isLoading={false}
          error={null}
          onRefresh={() => {}}
          isBusy={false}
        />
      </div>
    </div>
  );
}
