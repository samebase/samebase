// @vitest-environment jsdom

import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  VaultPullRequestList,
  type VaultCloudflareBuild,
  type VaultCloudflareBuilds,
  type VaultCloudflareObservation,
  type VaultDefaultBranchSummary,
  type VaultPullRequestChecks,
  type VaultPullRequestListItem,
} from "@/components/vault-dashboard/VaultPullRequestList";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

const successfulChecks = {
  state: "success",
  totalCount: 6,
  checkRunCount: 5,
  statusContextCount: 1,
  successCount: 5,
  failureCount: 0,
  runningCount: 0,
  neutralCount: 1,
  unknownCount: 0,
} satisfies VaultPullRequestChecks;

const defaultBranch = {
  state: "ready",
  name: "main",
  githubUrl: "https://github.com/samebase/samebase/tree/main",
  samebaseUrl: "/vault/samebase/samebase/fs/main",
  headSha: "abc1234567890",
  headUrl: "https://github.com/samebase/samebase/commit/abc1234567890",
  checks: successfulChecks,
} satisfies VaultDefaultBranchSummary;

type CloudflareBuildFields = Omit<
  Extract<VaultCloudflareBuild, { state: "queued" }>,
  "state" | "preview"
>;

function cloudflareBuildFields(args: {
  source: CloudflareBuildFields["source"];
  workerName: string;
  rootDirectory: CloudflareBuildFields["rootDirectory"];
  providerStatus: string;
  providerConclusion: CloudflareBuildFields["providerConclusion"];
}): CloudflareBuildFields {
  return {
    source: args.source,
    checkName: `Workers Builds: ${args.workerName}`,
    workerName: args.workerName,
    rootDirectory: args.rootDirectory,
    branch: { state: "known", name: "feature/preview" },
    providerStatus: args.providerStatus,
    providerConclusion: args.providerConclusion,
  };
}

function pullRequestWithObservation(
  id: string,
  cloudflare: VaultCloudflareObservation,
): VaultPullRequestListItem {
  return {
    id,
    number: Number(id),
    title: `Pull request ${id}`,
    url: `https://github.com/samebase/samebase/pull/${id}`,
    isDraft: false,
    head: {
      kind: "local",
      branchName: `feature/${id}`,
      samebaseUrl: `/vault/samebase/samebase/fs/feature%2F${id}`,
    },
    baseBranchName: "main",
    labels: [],
    additions: 12,
    deletions: 3,
    changedFiles: 2,
    checks: successfulChecks,
    cloudflare,
  };
}

function renderList(args: {
  defaultBranch?: VaultDefaultBranchSummary;
  pullRequests: readonly VaultPullRequestListItem[];
}): HTMLDivElement {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <TestRouterProvider initialEntries={["/vault/samebase/samebase"]}>
      <VaultPullRequestList
        defaultBranch={args.defaultBranch ?? defaultBranch}
        pullRequests={args.pullRequests}
      />
    </TestRouterProvider>,
  );
  return root;
}

describe("VaultPullRequestList", () => {
  it("renders a pull request as one primary identity with secondary branch metadata", () => {
    const pullRequest = {
      ...pullRequestWithObservation("42", { state: "fresh_absence" }),
      title: "Keep previews distinct in monorepos",
      isDraft: true,
      labels: [{ name: "preview", color: "BFD4F2" }],
      additions: 1_240,
      deletions: 318,
      changedFiles: 17,
    } satisfies VaultPullRequestListItem;
    const root = renderList({ pullRequests: [pullRequest] });
    const row = root.querySelector('[data-pull-request-number="42"]');

    expect(row).not.toBeNull();
    expect(row?.querySelectorAll("[data-pull-request-primary-link]")).toHaveLength(1);
    expect(row?.querySelector("[data-pull-request-primary-link]")?.textContent).toContain(
      "PR #42 Keep previews distinct in monorepos",
    );
    expect(row?.textContent).toContain("feature/42 → main");
    expect(row?.textContent).toContain("draft");
    expect(row?.textContent).toContain("preview");
    expect(row?.textContent).toContain("6 passed");
    expect(row?.textContent).toContain("+1,240 −318 · 17 files");
    expect(row?.textContent).toContain("View changes");
  });

  it("identifies fork heads without offering a Samebase branch link", () => {
    const pullRequest = {
      ...pullRequestWithObservation("43", { state: "fresh_absence" }),
      head: {
        kind: "fork",
        branchName: "preview-work",
        repositoryFullName: "contributor/samebase",
      },
    } satisfies VaultPullRequestListItem;
    const root = renderList({ pullRequests: [pullRequest] });
    const row = root.querySelector('[data-pull-request-number="43"]');

    expect(row?.textContent).toContain("contributor/samebase:preview-work → main");
    expect(row?.textContent).toContain("fork");
    expect(row?.textContent).not.toContain("View changes");
  });

  it("renders nonempty text for every preview observation state", () => {
    const currentBuilds = {
      first: {
        state: "success",
        ...cloudflareBuildFields({
          source: {
            state: "cloudflare_build",
            checkRunId: "alpha-current",
            buildId: "alpha-build-current",
          },
          workerName: "samebase-alpha",
          rootDirectory: { state: "known", value: "apps/alpha" },
          providerStatus: "completed",
          providerConclusion: { state: "provided", value: "success" },
        }),
        preview: {
          state: "ready",
          versionUrl: "https://version.alpha.workers.dev",
          branchAlias: {
            state: "ready",
            branchName: "feature/3",
            url: "https://feature-3.alpha.workers.dev",
          },
        },
      },
      rest: [],
    } satisfies VaultCloudflareBuilds;
    const root = renderList({
      pullRequests: [
        pullRequestWithObservation("0", { state: "not_requested" }),
        pullRequestWithObservation("1", { state: "loading" }),
        pullRequestWithObservation("2", { state: "ready", builds: currentBuilds }),
        pullRequestWithObservation("3", { state: "fresh_absence" }),
        pullRequestWithObservation("4", {
          state: "stale",
          lastKnown: { state: "fresh_absence" },
          refresh: { state: "loading" },
        }),
        pullRequestWithObservation("5", {
          state: "budget_deferred",
          reason: "request_budget",
          retryAt: 10_000,
        }),
        pullRequestWithObservation("6", {
          state: "provider_unavailable",
          reason: "github_connection_unavailable",
        }),
        pullRequestWithObservation("7", {
          state: "provider_failure",
          reason: "request_failed",
        }),
      ],
    });
    const states = Array.from(root.querySelectorAll("[data-preview-observation-state]"));

    expect(states).toHaveLength(8);
    expect(states.map((state) => state.getAttribute("data-preview-observation-state"))).toEqual([
      "not_requested",
      "loading",
      "ready",
      "fresh_absence",
      "stale",
      "budget_deferred",
      "provider_unavailable",
      "provider_failure",
    ]);
    for (const state of states) {
      expect(state.textContent.trim().length).toBeGreaterThan(0);
    }
    expect(root.textContent).toContain("Previews not checked");
    expect(root.textContent).toContain("Checking previews");
    expect(root.textContent).toContain("No Cloudflare build ran");
    expect(root.textContent).toContain("Preview information is stale: updating");
    expect(root.textContent).toContain("Preview check deferred");
    expect(root.textContent).toContain("GitHub connection unavailable");
    expect(root.textContent).toContain("Preview request failed");
  });

  it("distinguishes expired preview data before its next refresh starts", () => {
    const root = renderList({
      pullRequests: [
        pullRequestWithObservation("9", {
          state: "stale",
          lastKnown: { state: "fresh_absence" },
          refresh: { state: "not_requested" },
        }),
      ],
    });

    expect(root.textContent).toContain("Preview information is stale");
    expect(root.textContent).not.toContain("Preview information is stale: refresh failed");
  });

  it("renders every build and preview result without inventing absent detail links", () => {
    const queuedBuild = {
      state: "queued",
      ...cloudflareBuildFields({
        source: { state: "github_check_run", checkRunId: "queued" },
        workerName: "queued-worker",
        rootDirectory: { state: "unknown" },
        providerStatus: "queued",
        providerConclusion: { state: "not_provided" },
      }),
      preview: { state: "pending" },
    } satisfies VaultCloudflareBuild;
    const builds = {
      first: queuedBuild,
      rest: [
        {
          state: "running",
          ...cloudflareBuildFields({
            source: {
              state: "cloudflare_build",
              checkRunId: "running",
              buildId: "running-build",
            },
            workerName: "running-worker",
            rootDirectory: { state: "known", value: "apps/running" },
            providerStatus: "in_progress",
            providerConclusion: { state: "not_provided" },
          }),
          preview: {
            state: "ready",
            versionUrl: "https://version.running.workers.dev",
            branchAlias: {
              state: "ready",
              branchName: "feature/running",
              url: "https://feature-running.workers.dev",
            },
          },
        },
        {
          state: "success",
          ...cloudflareBuildFields({
            source: { state: "github_check_run", checkRunId: "disabled" },
            workerName: "disabled-worker",
            rootDirectory: { state: "known", value: "apps/disabled" },
            providerStatus: "completed",
            providerConclusion: { state: "provided", value: "success" },
          }),
          preview: { state: "disabled" },
        },
        {
          state: "failure",
          ...cloudflareBuildFields({
            source: { state: "github_check_run", checkRunId: "failed" },
            workerName: "failed-worker",
            rootDirectory: { state: "known", value: "apps/failed" },
            providerStatus: "completed",
            providerConclusion: { state: "provided", value: "failure" },
          }),
          preview: { state: "unavailable" },
        },
        {
          state: "cancelled",
          ...cloudflareBuildFields({
            source: { state: "github_check_run", checkRunId: "cancelled" },
            workerName: "cancelled-worker",
            rootDirectory: { state: "known", value: "apps/cancelled" },
            providerStatus: "completed",
            providerConclusion: { state: "provided", value: "cancelled" },
          }),
          preview: {
            state: "ready",
            versionUrl: "https://version.cancelled.workers.dev",
            branchAlias: { state: "not_provided" },
          },
        },
        {
          state: "skipped",
          ...cloudflareBuildFields({
            source: { state: "github_check_run", checkRunId: "skipped" },
            workerName: "skipped-worker",
            rootDirectory: { state: "known", value: "apps/skipped" },
            providerStatus: "completed",
            providerConclusion: { state: "provided", value: "skipped" },
          }),
          preview: { state: "provider_unknown", reason: "invalid_provider_output" },
        },
        {
          state: "provider_unknown",
          ...cloudflareBuildFields({
            source: { state: "github_check_run", checkRunId: "unknown" },
            workerName: "unknown-worker",
            rootDirectory: { state: "known", value: "apps/unknown" },
            providerStatus: "mystery",
            providerConclusion: { state: "not_provided" },
          }),
          preview: {
            state: "ready",
            versionUrl: "https://version.unknown.workers.dev",
            branchAlias: {
              state: "provider_unknown",
              reason: "branch_unavailable",
              providerUrl: "https://provider-branch.unknown.workers.dev",
            },
          },
        },
      ],
    } satisfies VaultCloudflareBuilds;
    const root = renderList({
      pullRequests: [pullRequestWithObservation("8", { state: "ready", builds })],
    });

    for (const label of [
      "Queued",
      "Running",
      "Succeeded",
      "Failed",
      "Cancelled",
      "Skipped",
      "Build state unknown",
      "Preview pending",
      "Preview disabled",
      "No preview",
      "Preview result unknown",
      "Branch preview not provided",
      "Branch preview unknown",
    ]) {
      expect(root.textContent).toContain(label);
    }

    const links = Array.from(root.querySelectorAll("a"));
    expect(links.filter((link) => link.textContent.trim() === "Preview")).toHaveLength(1);
    expect(links.filter((link) => link.textContent.trim() === "Version")).toHaveLength(3);
    expect(links.filter((link) => link.textContent.trim() === "Build")).toHaveLength(0);
    expect(links.some((link) => link.getAttribute("href") === "")).toBe(false);
  });

  it("states when the current repository has no open pull requests", () => {
    const root = renderList({ pullRequests: [] });

    expect(root.textContent).toContain("No open pull requests");
    expect(root.querySelectorAll("[data-default-branch-row]")).toHaveLength(1);
  });
});
