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
      githubRow: availableGithubRow("samebase/loading-provider-data"),
      apps: [
        {
          appId: "app-root",
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
    },
  },
  {
    repositoryName: "shared-convex-monorepo-fixture",
    state: {
      githubRow: availableGithubRow("samebase/shared-convex-monorepo-fixture"),
      apps: [
        {
          appId: "app-backend",
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
            {
              provider: "cloudflare",
              rowId: "cloudflare:add:app-backend",
              status: "action_required",
              actions: [
                {
                  kind: "add",
                  label: "?add-cloudflare",
                  href: "/vault/samebase/shared-convex-monorepo-fixture?add-cloudflare&app-root=convex",
                },
              ],
            },
          ],
        },
        {
          appId: "app-web",
          rootDirectory: "apps/web",
          rows: [
            {
              provider: "convex",
              rowId: "convex:add:app-web",
              status: "action_required",
              actions: [
                {
                  kind: "add",
                  label: "?add-convex",
                  href: "/vault/samebase/shared-convex-monorepo-fixture?add-convex&app-root=apps%2Fweb",
                },
              ],
            },
            {
              provider: "cloudflare",
              rowId: "cloudflare:worker-web",
              status: "available",
              scope: "samebase",
              value: "fixture-web",
              href: "https://dash.cloudflare.com/?to=/account/workers/services/view/fixture-web/production/deployments",
            },
            {
              provider: "cloudflare",
              rowId: "cloudflare:worker-web-previewless",
              status: "available",
              value: "fixture-web-previewless",
              href: "https://dash.cloudflare.com/?to=/account/workers/services/view/fixture-web-previewless/production/deployments",
              description: "Preview URL disabled.",
            },
          ],
        },
      ],
    },
  },
  {
    repositoryName: "provider-errors",
    state: {
      githubRow: availableGithubRow("samebase/provider-errors"),
      apps: [
        {
          appId: "app-root",
          rootDirectory: "/",
          rows: [
            {
              provider: "convex",
              rowId: "convex:project-missing",
              status: "missing",
              value: "deleted-project",
              description: "Missing from Convex.",
              actions: [{ kind: "remove", label: "Remove from Samebase", onClick: noop }],
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
    },
  },
  {
    repositoryName: "existing-repository",
    state: {
      githubRow: availableGithubRow("samebase/existing-repository"),
      apps: [
        {
          appId: "app-root",
          rootDirectory: "/",
          rows: [
            {
              provider: "convex",
              rowId: "convex:add:app-root",
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
              rowId: "cloudflare:add:app-root",
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
                isReady={true}
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
