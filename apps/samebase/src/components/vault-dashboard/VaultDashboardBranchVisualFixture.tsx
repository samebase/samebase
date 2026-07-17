import {
  VaultPullRequestList,
  type VaultCloudflareBuild,
  type VaultCloudflareBuilds,
  type VaultDefaultBranchSummary,
  type VaultPullRequestListItem,
} from "@/components/vault-dashboard/VaultPullRequestList";
import { TestRouterProvider } from "@/test/TestRouterProvider";

const FIXTURE_NOW = Date.parse("2026-07-17T12:00:00.000Z");

export type VaultDashboardBranchVisualMode =
  | "vault-pull-request-list-settled"
  | "vault-pull-request-list-operational-states";

type CloudflareBuildFields = Omit<
  Extract<VaultCloudflareBuild, { state: "queued" }>,
  "state" | "preview"
>;

function cloudflareBuildFields(args: {
  source: CloudflareBuildFields["source"];
  workerName: string;
  rootDirectory: CloudflareBuildFields["rootDirectory"];
  branch: CloudflareBuildFields["branch"];
  providerStatus: string;
  providerConclusion: CloudflareBuildFields["providerConclusion"];
}): CloudflareBuildFields {
  return {
    source: args.source,
    checkName: `Workers Builds: ${args.workerName}`,
    workerName: args.workerName,
    rootDirectory: args.rootDirectory,
    branch: args.branch,
    providerStatus: args.providerStatus,
    providerConclusion: args.providerConclusion,
  };
}

const settledDefaultBranch = {
  state: "ready",
  name: "main",
  githubUrl: "https://github.com/samebase/samebase/tree/main",
  samebaseUrl: "/vault/samebase/samebase/fs/main",
  headSha: "a52d8e17b9f1",
  headUrl: "https://github.com/samebase/samebase/commit/a52d8e17b9f1",
  checks: {
    state: "success",
    totalCount: 7,
    checkRunCount: 7,
    statusContextCount: 0,
    successCount: 7,
    failureCount: 0,
    runningCount: 0,
    neutralCount: 0,
    unknownCount: 0,
  },
} satisfies VaultDefaultBranchSummary;

const alphaBuild = {
  state: "success",
  ...cloudflareBuildFields({
    source: {
      state: "cloudflare_build",
      checkRunId: "alpha-412-check",
      buildId: "alpha-412-build",
    },
    workerName: "fixture-alpha",
    rootDirectory: { state: "known", value: "apps/alpha" },
    branch: { state: "known", name: "codex/monorepo-preview-links" },
    providerStatus: "completed",
    providerConclusion: { state: "provided", value: "success" },
  }),
  preview: {
    state: "ready",
    versionUrl: "https://412-a1b2.fixture-alpha.workers.dev",
    branchAlias: {
      state: "ready",
      branchName: "codex/monorepo-preview-links",
      url: "https://codex-monorepo-preview-links.fixture-alpha.workers.dev",
    },
  },
} satisfies VaultCloudflareBuild;

const settledBuilds = {
  first: alphaBuild,
  rest: [
    {
      state: "success",
      ...cloudflareBuildFields({
        source: {
          state: "cloudflare_build",
          checkRunId: "beta-412-check",
          buildId: "beta-412-build",
        },
        workerName: "fixture-beta",
        rootDirectory: { state: "known", value: "apps/beta" },
        branch: { state: "known", name: "codex/monorepo-preview-links" },
        providerStatus: "completed",
        providerConclusion: { state: "provided", value: "success" },
      }),
      preview: {
        state: "ready",
        versionUrl: "https://412-c3d4.fixture-beta.workers.dev",
        branchAlias: {
          state: "ready",
          branchName: "codex/monorepo-preview-links",
          url: "https://codex-monorepo-preview-links.fixture-beta.workers.dev",
        },
      },
    },
  ],
} satisfies VaultCloudflareBuilds;

const settledPullRequests = [
  {
    id: "PR_kwDO_alpha",
    number: 412,
    title: "Keep preview links distinct in monorepos",
    url: "https://github.com/samebase/samebase/pull/412",
    isDraft: false,
    head: {
      kind: "local",
      branchName: "codex/monorepo-preview-links",
      samebaseUrl: "/vault/samebase/samebase/fs/codex%2Fmonorepo-preview-links?compare",
    },
    baseBranchName: "main",
    labels: [
      { name: "preview", color: "bfd4f2" },
      { name: "backend", color: "d4c5f9" },
    ],
    additions: 1_240,
    deletions: 318,
    changedFiles: 17,
    checks: {
      state: "success",
      totalCount: 6,
      checkRunCount: 6,
      statusContextCount: 0,
      successCount: 6,
      failureCount: 0,
      runningCount: 0,
      neutralCount: 0,
      unknownCount: 0,
    },
    cloudflare: { state: "ready", builds: settledBuilds },
  },
  {
    id: "PR_kwDO_beta",
    number: 411,
    title: "Document the Expo handoff",
    url: "https://github.com/samebase/samebase/pull/411",
    isDraft: true,
    head: {
      kind: "fork",
      branchName: "expo-handoff",
      repositoryFullName: "contributor/samebase",
    },
    baseBranchName: "main",
    labels: [{ name: "docs", color: "0075ca" }],
    additions: 81,
    deletions: 7,
    changedFiles: 4,
    checks: {
      state: "running",
      totalCount: 7,
      checkRunCount: 7,
      statusContextCount: 0,
      successCount: 5,
      failureCount: 0,
      runningCount: 2,
      neutralCount: 0,
      unknownCount: 0,
    },
    cloudflare: { state: "fresh_absence" },
  },
] satisfies readonly VaultPullRequestListItem[];

const staleBuilds = {
  first: {
    state: "running",
    ...cloudflareBuildFields({
      source: { state: "github_check_run", checkRunId: "alpha-500-check" },
      workerName: "fixture-alpha",
      rootDirectory: { state: "known", value: "apps/alpha" },
      branch: { state: "known", name: "codex/monorepo-preview-links" },
      providerStatus: "in_progress",
      providerConclusion: { state: "not_provided" },
    }),
    preview: { state: "pending" },
  },
  rest: [
    {
      state: "failure",
      ...cloudflareBuildFields({
        source: {
          state: "cloudflare_build",
          checkRunId: "beta-500-check",
          buildId: "beta-500-build",
        },
        workerName: "fixture-beta",
        rootDirectory: { state: "known", value: "apps/beta" },
        branch: { state: "known", name: "codex/monorepo-preview-links" },
        providerStatus: "completed",
        providerConclusion: { state: "provided", value: "failure" },
      }),
      preview: { state: "unavailable" },
    },
    {
      state: "provider_unknown",
      ...cloudflareBuildFields({
        source: { state: "github_check_run", checkRunId: "docs-500-check" },
        workerName: "fixture-docs",
        rootDirectory: { state: "unknown" },
        branch: { state: "unknown" },
        providerStatus: "mystery",
        providerConclusion: { state: "not_provided" },
      }),
      preview: { state: "provider_unknown", reason: "unrecognized_build_state" },
    },
  ],
} satisfies VaultCloudflareBuilds;

const operationalPullRequests = [
  {
    ...settledPullRequests[0],
    id: "PR_kwDO_not_requested",
    number: 502,
    title: "Leave offscreen previews unrequested",
    cloudflare: { state: "not_requested" },
  },
  {
    ...settledPullRequests[0],
    id: "PR_kwDO_loading",
    number: 501,
    title: "Load visible pull request observations",
    cloudflare: { state: "loading" },
  },
  {
    ...settledPullRequests[0],
    id: "PR_kwDO_stale",
    number: 500,
    title: "Retain the last complete provider observation",
    cloudflare: {
      state: "stale",
      lastKnown: { state: "ready", builds: staleBuilds },
      refresh: { state: "loading" },
    },
  },
  {
    ...settledPullRequests[0],
    id: "PR_kwDO_deferred",
    number: 499,
    title: "Respect the GitHub request budget",
    cloudflare: { state: "budget_deferred", reason: "request_budget", retryAt: 10_000 },
  },
  {
    ...settledPullRequests[0],
    id: "PR_kwDO_unavailable",
    number: 498,
    title: "Explain missing provider access",
    cloudflare: { state: "provider_unavailable", reason: "github_connection_unavailable" },
  },
  {
    ...settledPullRequests[0],
    id: "PR_kwDO_failed",
    number: 497,
    title: "Surface a failed preview observation",
    cloudflare: { state: "provider_failure", reason: "request_failed" },
  },
] satisfies readonly VaultPullRequestListItem[];

export function VaultDashboardBranchVisualFixture({
  mode,
}: {
  mode: VaultDashboardBranchVisualMode;
}) {
  const pullRequests =
    mode === "vault-pull-request-list-settled" ? settledPullRequests : operationalPullRequests;

  return (
    <div
      data-testid="vault-pull-request-list-visual-fixture"
      className="bg-background p-6 text-foreground"
    >
      <div className="mx-auto max-w-5xl overflow-hidden border bg-muted">
        <TestRouterProvider initialEntries={["/vault/samebase/samebase"]}>
          <VaultPullRequestList
            defaultBranch={settledDefaultBranch}
            now={FIXTURE_NOW}
            pullRequests={pullRequests}
          />
        </TestRouterProvider>
      </div>
    </div>
  );
}
