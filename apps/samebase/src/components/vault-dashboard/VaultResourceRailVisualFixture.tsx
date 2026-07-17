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
import type { Id } from "../../../convex/_generated/dataModel";

export type VaultResourceRailVisualMode = "vault-resource-rail";

type VaultResourceRailFixtureScenario = {
  repositoryName: string;
  title: string;
  state: VaultResourceRailState;
};

const noop = () => {};

function fakeVaultAppId(value: string): Id<"vaultApps"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs stable values for static rendering.
  return value;
}

const ROOT_APP_ID = fakeVaultAppId("app-repository-root");
const DOMAIN_ROUTER_APP_ID = fakeVaultAppId("app-domain-router");
const SAMEBASE_APP_ID = fakeVaultAppId("app-samebase");
const SHARED_BACKEND_APP_ID = fakeVaultAppId("app-shared-backend");
const MOBILE_APP_ID = fakeVaultAppId("app-mobile");

const ADD_VAULT_VALUES = {
  cloudflare: "tmp-my-new-app",
  convex: "tmp-my-new-app",
  github: "nicu-chiciuc/tmp-my-new-app",
} as const;

const ADD_VAULT_READY_VALUES = {
  cloudflare: "tmp-my-new-app",
  convex: "tmp-my-new-app",
  github: "nicu-chiciuc/tmp-my-new-app",
} as const;

const ADD_VAULT_READY_SCOPES = {
  cloudflare: "nicuchiciuc",
  convex: "nicu",
} as const;

const ADD_VAULT_READY_URLS = {
  cloudflare:
    "https://dash.cloudflare.com/?to=/workers/services/view/tmp-my-new-app/production/overview",
  convex: "https://dashboard.convex.dev/t/nicu/tmp-my-new-app/settings",
  github: "https://github.com/nicu-chiciuc/tmp-my-new-app",
} as const;

function buildRootFixtureState({
  appRows,
  githubRow,
}: {
  appRows: readonly VaultResourceRailRowState<"cloudflare" | "convex">[];
  githubRow: VaultResourceRailRowState<"github">;
}): VaultResourceRailState {
  return {
    githubRow,
    apps: [{ appId: ROOT_APP_ID, rootDirectory: "/", rows: appRows }],
  };
}

const ADD_VAULT_FLOW_SCENARIOS = [
  {
    title: "Creating repository",
    repositoryName: "tmp-my-new-app",
    state: buildRootFixtureState({
      githubRow: {
        provider: "github",
        rowId: "github:creating",
        status: "running",
        value: ADD_VAULT_VALUES.github,
      },
      appRows: [
        {
          provider: "convex",
          rowId: "convex:creating",
          status: "pending",
          value: ADD_VAULT_VALUES.convex,
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:creating",
          status: "pending",
          value: ADD_VAULT_VALUES.cloudflare,
        },
      ],
    }),
  },
  {
    title: "Provisioning Convex",
    repositoryName: "tmp-my-new-app",
    state: buildRootFixtureState({
      githubRow: {
        provider: "github",
        rowId: "github:convex",
        status: "ready",
        value: ADD_VAULT_READY_VALUES.github,
        href: ADD_VAULT_READY_URLS.github,
      },
      appRows: [
        {
          provider: "convex",
          rowId: "convex:provisioning",
          status: "running",
          value: ADD_VAULT_VALUES.convex,
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:waiting-for-convex",
          status: "pending",
          value: ADD_VAULT_VALUES.cloudflare,
        },
      ],
    }),
  },
  {
    title: "Provisioning Cloudflare",
    repositoryName: "tmp-my-new-app",
    state: buildRootFixtureState({
      githubRow: {
        provider: "github",
        rowId: "github:cloudflare",
        status: "ready",
        value: ADD_VAULT_READY_VALUES.github,
        href: ADD_VAULT_READY_URLS.github,
      },
      appRows: [
        {
          provider: "convex",
          rowId: "convex:ready-before-cloudflare",
          status: "ready",
          scope: ADD_VAULT_READY_SCOPES.convex,
          value: ADD_VAULT_READY_VALUES.convex,
          href: ADD_VAULT_READY_URLS.convex,
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:provisioning",
          status: "running",
          value: ADD_VAULT_VALUES.cloudflare,
        },
      ],
    }),
  },
  {
    title: "Ready",
    repositoryName: "tmp-my-new-app",
    state: buildRootFixtureState({
      githubRow: {
        provider: "github",
        rowId: "github:ready",
        status: "ready",
        value: ADD_VAULT_READY_VALUES.github,
        href: ADD_VAULT_READY_URLS.github,
      },
      appRows: [
        {
          provider: "convex",
          rowId: "convex:ready",
          status: "ready",
          scope: ADD_VAULT_READY_SCOPES.convex,
          value: ADD_VAULT_READY_VALUES.convex,
          href: ADD_VAULT_READY_URLS.convex,
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:ready",
          status: "ready",
          scope: ADD_VAULT_READY_SCOPES.cloudflare,
          value: ADD_VAULT_READY_VALUES.cloudflare,
          href: ADD_VAULT_READY_URLS.cloudflare,
        },
      ],
    }),
  },
  {
    title: "Cloudflare failed",
    repositoryName: "tmp-my-new-app",
    state: buildRootFixtureState({
      githubRow: {
        provider: "github",
        rowId: "github:cloudflare-failed",
        status: "ready",
        value: ADD_VAULT_READY_VALUES.github,
        href: ADD_VAULT_READY_URLS.github,
      },
      appRows: [
        {
          provider: "convex",
          rowId: "convex:cloudflare-failed",
          status: "ready",
          scope: ADD_VAULT_READY_SCOPES.convex,
          value: ADD_VAULT_READY_VALUES.convex,
          href: ADD_VAULT_READY_URLS.convex,
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:failed",
          status: "failed",
          value: ADD_VAULT_VALUES.cloudflare,
          actions: [
            {
              kind: "retry",
              label: "Retry",
              onClick: noop,
            },
          ],
        },
      ],
    }),
  },
  {
    title: "Cloudflare retrying",
    repositoryName: "tmp-my-new-app",
    state: buildRootFixtureState({
      githubRow: {
        provider: "github",
        rowId: "github:cloudflare-retrying",
        status: "ready",
        value: ADD_VAULT_READY_VALUES.github,
        href: ADD_VAULT_READY_URLS.github,
      },
      appRows: [
        {
          provider: "convex",
          rowId: "convex:cloudflare-retrying",
          status: "ready",
          scope: ADD_VAULT_READY_SCOPES.convex,
          value: ADD_VAULT_READY_VALUES.convex,
          href: ADD_VAULT_READY_URLS.convex,
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:retrying",
          status: "failed",
          value: ADD_VAULT_VALUES.cloudflare,
          actions: [
            {
              kind: "retry",
              label: "Retrying...",
              disabled: true,
            },
          ],
        },
      ],
    }),
  },
  {
    title: "Monorepo apps",
    repositoryName: "samebase",
    state: {
      githubRow: {
        provider: "github",
        rowId: "github:monorepo",
        status: "ready",
        value: "samebase/samebase",
        href: "https://github.com/samebase/samebase",
      },
      apps: [
        {
          appId: DOMAIN_ROUTER_APP_ID,
          rootDirectory: "apps/domain-router",
          rows: [
            {
              provider: "cloudflare",
              rowId: "cloudflare:domain-router",
              status: "ready",
              scope: "nicuchiciuc",
              value: "domain-router",
              href: "https://dash.cloudflare.com/?to=/workers/services/view/domain-router/production/overview",
            },
          ],
        },
        {
          appId: MOBILE_APP_ID,
          rootDirectory: "apps/mobile",
          rows: [],
        },
        {
          appId: SAMEBASE_APP_ID,
          rootDirectory: "apps/samebase",
          rows: [
            {
              provider: "cloudflare",
              rowId: "cloudflare:samebase-worker",
              status: "ready",
              scope: "nicuchiciuc",
              value: "samebase-worker",
              href: "https://dash.cloudflare.com/?to=/workers/services/view/samebase-worker/production/overview",
              description: "Deploys the shared Convex backend from packages/backend.",
            },
            {
              provider: "cloudflare",
              rowId: "cloudflare:samebase-posthog-proxy",
              status: "ready",
              scope: "nicuchiciuc",
              value: "samebase-posthog-proxy",
              href: "https://dash.cloudflare.com/?to=/workers/services/view/samebase-posthog-proxy/production/overview",
              description: "Deploys the shared Convex backend from packages/backend.",
            },
          ],
        },
        {
          appId: SHARED_BACKEND_APP_ID,
          rootDirectory: "packages/backend",
          rows: [
            {
              provider: "convex",
              rowId: "convex:shared-backend",
              status: "ready",
              scope: "samebase",
              value: "samebase",
              href: "https://dashboard.convex.dev/t/samebase/samebase/settings",
            },
          ],
        },
      ],
    },
  },
  {
    title: "Existing repository",
    repositoryName: "weight_tsx",
    state: buildRootFixtureState({
      githubRow: {
        provider: "github",
        rowId: "github:existing",
        status: "ready",
        value: "nicu-chiciuc/weight_tsx",
        href: "https://github.com/nicu-chiciuc/weight_tsx",
      },
      appRows: [
        {
          provider: "convex",
          rowId: "convex:existing:add",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-convex",
              href: "/vault/nicu-chiciuc/weight_tsx?add-convex",
            },
          ],
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:existing:add",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-cloudflare",
              href: "/vault/nicu-chiciuc/weight_tsx?add-cloudflare",
            },
          ],
        },
      ],
    }),
  },
] satisfies readonly VaultResourceRailFixtureScenario[];

function VaultResourceRailFixtureCard({
  scenario,
}: {
  scenario: VaultResourceRailFixtureScenario;
}) {
  return (
    <VaultDashboardRepositoryCard
      isReady={true}
      repositoryName={scenario.repositoryName}
      repositoryLinks={<VaultResourceRail state={scenario.state} />}
      repositoryLinksOpen={true}
      onRepositoryLinksOpenChange={() => {}}
    />
  );
}

export function VaultResourceRailVisualFixture() {
  return (
    <WorkspaceLayoutV2FixtureFrame
      dataTestId="vault-resource-rail-visual-fixture"
      main={{
        content: (
          <VaultDashboardRepositoryList>
            {ADD_VAULT_FLOW_SCENARIOS.map((scenario, index) => (
              <VaultResourceRailFixtureCard
                key={`${scenario.title}:${index}`}
                scenario={scenario}
              />
            ))}
          </VaultDashboardRepositoryList>
        ),
      }}
    />
  );
}
