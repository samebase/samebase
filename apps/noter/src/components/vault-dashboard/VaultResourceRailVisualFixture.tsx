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
  repositoryOwner: string;
  title: string;
  state: VaultResourceRailState;
};

const noop = () => {};

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
    apps: [{ appRoot: ".", rows: appRows }],
  };
}

const ADD_VAULT_FLOW_SCENARIOS = [
  {
    title: "Creating repository",
    repositoryOwner: "nicu-chiciuc",
    repositoryName: "tmp-my-new-app",
    state: buildRootFixtureState({
      githubRow: {
        provider: "github",
        status: "running",
        value: ADD_VAULT_VALUES.github,
      },
      appRows: [
        {
          provider: "convex",
          status: "pending",
          value: ADD_VAULT_VALUES.convex,
        },
        {
          provider: "cloudflare",
          status: "pending",
          value: ADD_VAULT_VALUES.cloudflare,
        },
      ],
    }),
  },
  {
    title: "Provisioning Convex",
    repositoryOwner: "nicu-chiciuc",
    repositoryName: "tmp-my-new-app",
    state: buildRootFixtureState({
      githubRow: {
        provider: "github",
        status: "ready",
        value: ADD_VAULT_READY_VALUES.github,
        href: ADD_VAULT_READY_URLS.github,
      },
      appRows: [
        {
          provider: "convex",
          status: "running",
          value: ADD_VAULT_VALUES.convex,
        },
        {
          provider: "cloudflare",
          status: "pending",
          value: ADD_VAULT_VALUES.cloudflare,
        },
      ],
    }),
  },
  {
    title: "Provisioning Cloudflare",
    repositoryOwner: "nicu-chiciuc",
    repositoryName: "tmp-my-new-app",
    state: buildRootFixtureState({
      githubRow: {
        provider: "github",
        status: "ready",
        value: ADD_VAULT_READY_VALUES.github,
        href: ADD_VAULT_READY_URLS.github,
      },
      appRows: [
        {
          provider: "convex",
          status: "ready",
          scope: ADD_VAULT_READY_SCOPES.convex,
          value: ADD_VAULT_READY_VALUES.convex,
          href: ADD_VAULT_READY_URLS.convex,
        },
        {
          provider: "cloudflare",
          status: "running",
          value: ADD_VAULT_VALUES.cloudflare,
        },
      ],
    }),
  },
  {
    title: "Ready",
    repositoryOwner: "nicu-chiciuc",
    repositoryName: "tmp-my-new-app",
    state: buildRootFixtureState({
      githubRow: {
        provider: "github",
        status: "ready",
        value: ADD_VAULT_READY_VALUES.github,
        href: ADD_VAULT_READY_URLS.github,
      },
      appRows: [
        {
          provider: "convex",
          status: "ready",
          scope: ADD_VAULT_READY_SCOPES.convex,
          value: ADD_VAULT_READY_VALUES.convex,
          href: ADD_VAULT_READY_URLS.convex,
        },
        {
          provider: "cloudflare",
          status: "ready",
          scope: ADD_VAULT_READY_SCOPES.cloudflare,
          value: ADD_VAULT_READY_VALUES.cloudflare,
          href: ADD_VAULT_READY_URLS.cloudflare,
        },
      ],
    }),
  },
  {
    title: "Monorepo apps",
    repositoryOwner: "noter-md",
    repositoryName: "noter",
    state: {
      githubRow: {
        provider: "github",
        status: "ready",
        value: "noter-md/noter",
        href: "https://github.com/noter-md/noter",
      },
      apps: [
        {
          appRoot: ".",
          rows: [
            {
              provider: "convex",
              status: "ready",
              scope: "noter",
              value: "noter",
              href: "https://dashboard.convex.dev/t/noter/noter/settings",
              actions: [{ kind: "add", label: "?add-convex", href: "/home?add-convex#noter" }],
            },
            {
              provider: "cloudflare",
              status: "action_required",
              actions: [
                {
                  kind: "add",
                  label: "?add-cloudflare",
                  href: "/home?add-cloudflare#noter",
                },
              ],
            },
          ],
        },
        {
          appRoot: "apps/domain-router",
          rows: [
            {
              provider: "convex",
              status: "ready",
              scope: "samebase",
              value: "samebase-domains",
              href: "https://dashboard.convex.dev/t/samebase/samebase-domains/settings",
            },
            {
              provider: "cloudflare",
              status: "ready",
              scope: "nicuchiciuc",
              value: "domain-router",
              href: "https://dash.cloudflare.com/?to=/workers/services/view/domain-router/production/overview",
            },
          ],
        },
        {
          appRoot: "apps/noter",
          rows: [
            {
              provider: "convex",
              status: "action_required",
              actions: [{ kind: "add", label: "?add-convex", href: "/home?add-convex#noter" }],
            },
            {
              provider: "cloudflare",
              status: "ready",
              scope: "nicuchiciuc",
              value: "noter-worker",
              href: "https://dash.cloudflare.com/?to=/workers/services/view/noter-worker/production/overview",
            },
          ],
        },
      ],
    },
  },
  {
    title: "Existing repository",
    repositoryOwner: "nicu-chiciuc",
    repositoryName: "weight_tsx",
    state: buildRootFixtureState({
      githubRow: {
        provider: "github",
        status: "ready",
        value: "nicu-chiciuc/weight_tsx",
        href: "https://github.com/nicu-chiciuc/weight_tsx",
      },
      appRows: [
        {
          provider: "convex",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-convex",
              href: "/home?add-convex#weight_tsx",
            },
          ],
        },
        {
          provider: "cloudflare",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-cloudflare",
              href: "/home?add-cloudflare#weight_tsx",
            },
          ],
        },
      ],
    }),
  },
  {
    title: "Cloudflare failed",
    repositoryOwner: "nicu-chiciuc",
    repositoryName: "tmp-my-new-app",
    state: buildRootFixtureState({
      githubRow: {
        provider: "github",
        status: "ready",
        value: ADD_VAULT_READY_VALUES.github,
        href: ADD_VAULT_READY_URLS.github,
      },
      appRows: [
        {
          provider: "convex",
          status: "ready",
          scope: ADD_VAULT_READY_SCOPES.convex,
          value: ADD_VAULT_READY_VALUES.convex,
          href: ADD_VAULT_READY_URLS.convex,
        },
        {
          provider: "cloudflare",
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
] satisfies readonly VaultResourceRailFixtureScenario[];

function VaultResourceRailFixtureCard({
  scenario,
}: {
  scenario: VaultResourceRailFixtureScenario;
}) {
  return (
    <VaultDashboardRepositoryCard
      isReady={true}
      repositoryOwner={scenario.repositoryOwner}
      repositoryName={scenario.repositoryName}
      repositoryLinks={<VaultResourceRail state={scenario.state} />}
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
