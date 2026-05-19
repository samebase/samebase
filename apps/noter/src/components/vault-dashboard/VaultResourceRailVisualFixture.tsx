import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import {
  VaultDashboardRepositoryCard,
  VaultDashboardRepositoryList,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import {
  VaultResourceRail,
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
  convex: "tmp-my-new-app/production",
  github: "nicu-chiciuc/tmp-my-new-app",
} as const;

const ADD_VAULT_READY_VALUES = {
  cloudflare: "tmp-my-new-app.nicuchiciuc.workers.dev",
  convex: "greedy-gnu-5",
  github: "nicu-chiciuc/tmp-my-new-app",
} as const;

const ADD_VAULT_FLOW_SCENARIOS = [
  {
    title: "Creating repository",
    repositoryOwner: "nicu-chiciuc",
    repositoryName: "tmp-my-new-app",
    state: {
      rows: [
        {
          provider: "github",
          status: "running",
          value: ADD_VAULT_VALUES.github,
        },
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
    },
  },
  {
    title: "Provisioning Convex",
    repositoryOwner: "nicu-chiciuc",
    repositoryName: "tmp-my-new-app",
    state: {
      rows: [
        {
          provider: "github",
          status: "ready",
          value: ADD_VAULT_READY_VALUES.github,
          href: "https://github.com/nicu-chiciuc/tmp-my-new-app",
        },
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
    },
  },
  {
    title: "Provisioning Cloudflare",
    repositoryOwner: "nicu-chiciuc",
    repositoryName: "tmp-my-new-app",
    state: {
      rows: [
        {
          provider: "github",
          status: "ready",
          value: ADD_VAULT_READY_VALUES.github,
          href: "https://github.com/nicu-chiciuc/tmp-my-new-app",
        },
        {
          provider: "convex",
          status: "ready",
          value: ADD_VAULT_READY_VALUES.convex,
        },
        {
          provider: "cloudflare",
          status: "running",
          value: ADD_VAULT_VALUES.cloudflare,
        },
      ],
    },
  },
  {
    title: "Ready",
    repositoryOwner: "nicu-chiciuc",
    repositoryName: "tmp-my-new-app",
    state: {
      rows: [
        {
          provider: "github",
          status: "ready",
          value: ADD_VAULT_READY_VALUES.github,
          href: "https://github.com/nicu-chiciuc/tmp-my-new-app",
        },
        {
          provider: "convex",
          status: "ready",
          value: ADD_VAULT_READY_VALUES.convex,
        },
        {
          provider: "cloudflare",
          status: "ready",
          value: ADD_VAULT_READY_VALUES.cloudflare,
          href: "https://tmp-my-new-app.nicuchiciuc.workers.dev",
        },
      ],
    },
  },
  {
    title: "Existing repository",
    repositoryOwner: "nicu-chiciuc",
    repositoryName: "weight_tsx",
    state: {
      rows: [
        {
          provider: "github",
          status: "ready",
          value: "nicu-chiciuc/weight_tsx",
          href: "https://github.com/nicu-chiciuc/weight_tsx",
        },
        {
          provider: "convex",
          status: "action_required",
          value: "Not connected",
          actions: [
            {
              kind: "connect_existing",
              label: "Connect",
              onClick: noop,
            },
            {
              kind: "create_new",
              label: "Create",
              onClick: noop,
            },
          ],
        },
        {
          provider: "cloudflare",
          status: "action_required",
          value: "Not connected",
          actions: [
            {
              kind: "connect_existing",
              label: "Connect",
              onClick: noop,
            },
            {
              kind: "create_new",
              label: "Create Worker",
              onClick: noop,
            },
          ],
        },
      ],
    },
  },
  {
    title: "Cloudflare failed",
    repositoryOwner: "nicu-chiciuc",
    repositoryName: "tmp-my-new-app",
    state: {
      rows: [
        {
          provider: "github",
          status: "ready",
          value: ADD_VAULT_READY_VALUES.github,
          href: "https://github.com/nicu-chiciuc/tmp-my-new-app",
        },
        {
          provider: "convex",
          status: "ready",
          value: ADD_VAULT_READY_VALUES.convex,
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
    },
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
      titleTitle={scenario.title}
      titleHref={`https://github.com/${scenario.repositoryOwner}/${scenario.repositoryName}`}
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
