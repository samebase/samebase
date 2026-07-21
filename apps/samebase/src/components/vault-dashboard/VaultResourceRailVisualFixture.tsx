import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import {
  VaultDashboardRepositoryCard,
  VaultDashboardRepositoryList,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import {
  VaultResourceRail,
  type VaultResourceRailRowState,
  type VaultResourceRailState,
} from "@/components/vault-dashboard/VaultResourceRail";

export type VaultResourceRailVisualMode = "vault-resource-rail";

type VaultResourceRailFixtureScenario = {
  repositoryName: string;
  state: VaultResourceRailState;
};

const noop = () => {};

function availableGithubRow(repositoryFullName: string): VaultResourceRailRowState<"github"> {
  return {
    provider: "github",
    rowId: "github",
    status: "available",
    value: repositoryFullName,
    href: `https://github.com/${repositoryFullName}`,
  };
}

const SCENARIOS = [
  {
    repositoryName: "loading-provider-data",
    state: {
      attentionRows: [],
      githubRow: availableGithubRow("samebase/loading-provider-data"),
      roots: [
        {
          rootDirectory: "/",
          rows: [
            {
              provider: "convex",
              rowId: "convex:project-loading",
              status: "loading",
              value: "loading-provider-data",
              description: "Loading from Convex...",
            },
            {
              provider: "cloudflare",
              rowId: "cloudflare:worker-loading",
              status: "loading",
              value: "loading-provider-data",
              description: "Loading from Cloudflare...",
            },
          ],
        },
      ],
      vaultActionRows: [],
    },
  },
  {
    repositoryName: "shared-convex-monorepo-fixture",
    state: {
      attentionRows: [],
      githubRow: availableGithubRow("samebase/shared-convex-monorepo-fixture"),
      roots: [
        {
          rootDirectory: "convex",
          rows: [
            {
              provider: "convex",
              rowId: "convex:shared-project",
              status: "available",
              scope: "samebase",
              value: "shared-convex-monorepo-fixture",
              href: "https://dashboard.convex.dev/t/samebase/shared-convex-monorepo-fixture/settings",
            },
          ],
        },
        {
          rootDirectory: "apps/web",
          rows: [
            {
              provider: "cloudflare",
              rowId: "cloudflare:worker-web",
              status: "available",
              scope: "samebase",
              value: "fixture-web",
              href: "https://dash.cloudflare.com/?to=/account/workers/services/view/fixture-web/production/settings",
              loadingDescription: "Loading Workers Builds...",
            },
            {
              provider: "cloudflare",
              rowId: "cloudflare:worker-web-previewless",
              status: "available",
              value: "fixture-web-previewless",
              href: "https://dash.cloudflare.com/?to=/account/workers/services/view/fixture-web-previewless/production/settings",
              description: "Preview URL disabled.",
            },
          ],
        },
      ],
      vaultActionRows: [
        {
          provider: "convex",
          rowId: "convex:add",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-convex",
              href: "/vault/samebase/shared-convex-monorepo-fixture?add-convex",
            },
          ],
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:add",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-cloudflare",
              href: "/vault/samebase/shared-convex-monorepo-fixture?add-cloudflare",
            },
          ],
        },
      ],
    },
  },
  {
    repositoryName: "provider-errors",
    state: {
      attentionRows: [],
      githubRow: availableGithubRow("samebase/provider-errors"),
      roots: [
        {
          rootDirectory: "/",
          rows: [
            {
              provider: "convex",
              rowId: "convex:project-missing",
              status: "missing",
              value: "deleted-project",
              description: "Missing from Convex.",
              actions: [{ kind: "remove", label: "Remove from vault", onClick: noop }],
            },
            {
              provider: "cloudflare",
              rowId: "cloudflare:worker-failed",
              status: "failed",
              value: "unavailable-worker",
              description: "Could not load from Cloudflare.",
              actions: [{ kind: "retry", label: "Reload", onClick: noop }],
            },
          ],
        },
      ],
      vaultActionRows: [],
    },
  },
  {
    repositoryName: "existing-repository",
    state: {
      attentionRows: [],
      githubRow: availableGithubRow("samebase/existing-repository"),
      roots: [],
      vaultActionRows: [
        {
          provider: "convex",
          rowId: "convex:add",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-convex",
              href: "/vault/samebase/existing-repository?add-convex",
            },
          ],
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:add",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-cloudflare",
              href: "/vault/samebase/existing-repository?add-cloudflare",
            },
          ],
        },
      ],
    },
  },
] satisfies readonly VaultResourceRailFixtureScenario[];

export function VaultResourceRailVisualFixture() {
  return (
    <WorkspaceLayoutV2FixtureFrame
      dataTestId="vault-resource-rail-visual-fixture"
      main={{
        content: (
          <VaultDashboardRepositoryList>
            {SCENARIOS.map((scenario) => (
              <VaultDashboardRepositoryCard
                key={scenario.repositoryName}
                muted={false}
                repositoryName={scenario.repositoryName}
                repositoryLinks={<VaultResourceRail state={scenario.state} />}
                repositoryLinksOpen={true}
                onRepositoryLinksOpenChange={() => {}}
              />
            ))}
          </VaultDashboardRepositoryList>
        ),
      }}
    />
  );
}
