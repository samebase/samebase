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

const RESOURCE_RAIL_FIXTURE_SCENARIOS = [
  {
    title: "Existing repo, no resources",
    repositoryOwner: "nicu-chiciuc",
    repositoryName: "weight_tsx",
    state: {
      github: {
        state: "connected",
        origin: "connected_existing",
        repositoryFullName: "nicu-chiciuc/weight_tsx",
        href: "https://github.com/nicu-chiciuc/weight_tsx",
      },
      convex: {
        state: "not_configured",
        detail: "Select an existing deployment or create a new project.",
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
      cloudflare: {
        state: "not_configured",
        detail: "Create a Worker or connect one from the selected account.",
        actions: [
          {
            kind: "create_new",
            label: "Create Worker",
            onClick: noop,
          },
        ],
      },
    },
  },
  {
    title: "Convex selected, Cloudflare provisioning",
    repositoryOwner: "noter-md",
    repositoryName: "notes-app",
    state: {
      github: {
        state: "connected",
        origin: "created_by_noter",
        repositoryFullName: "noter-md/notes-app",
        href: "https://github.com/noter-md/notes-app",
      },
      convex: {
        state: "selected",
        origin: "connected_existing",
        resourceName: "notes-app / production",
        detail: "Existing production deployment selected.",
      },
      cloudflare: {
        state: "provisioning",
        origin: "created_by_noter",
        resourceName: "notes-app",
        detail: "Creating Worker and build trigger.",
      },
    },
  },
  {
    title: "All resources connected",
    repositoryOwner: "noter-md",
    repositoryName: "dashboard",
    state: {
      github: {
        state: "connected",
        origin: "created_by_noter",
        repositoryFullName: "noter-md/dashboard",
        href: "https://github.com/noter-md/dashboard",
      },
      convex: {
        state: "connected",
        origin: "created_by_noter",
        resourceName: "dashboard / production",
        href: "https://dashboard.convex.dev/",
      },
      cloudflare: {
        state: "connected",
        origin: "created_by_noter",
        resourceName: "dashboard",
        href: "https://dash.cloudflare.com/",
      },
    },
  },
  {
    title: "Cloudflare failed",
    repositoryOwner: "nicuchiciuc",
    repositoryName: "portfolio",
    state: {
      github: {
        state: "connected",
        origin: "connected_existing",
        repositoryFullName: "nicuchiciuc/portfolio",
        href: "https://github.com/nicuchiciuc/portfolio",
      },
      convex: {
        state: "skipped",
        detail: "This repo has no Convex app yet.",
      },
      cloudflare: {
        state: "failed",
        resourceName: "portfolio",
        message: "Worker build trigger could not be created.",
        actions: [
          {
            kind: "retry",
            label: "Retry",
            onClick: noop,
          },
        ],
      },
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
            {RESOURCE_RAIL_FIXTURE_SCENARIOS.map((scenario) => (
              <VaultResourceRailFixtureCard
                key={`${scenario.repositoryOwner}/${scenario.repositoryName}`}
                scenario={scenario}
              />
            ))}
          </VaultDashboardRepositoryList>
        ),
      }}
    />
  );
}
