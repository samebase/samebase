import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleDot,
  ExternalLink,
  GitCommitHorizontal,
  GitPullRequest,
  LayoutList,
  LoaderCircle,
  MoreHorizontal,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { VaultChecksPopover } from "@/components/vault-dashboard/VaultChecksPopover";
import type { VaultDefaultBranchChecks } from "@/hooks/useVaultPullRequests";

export type VaultOverviewDesignLabVisualMode =
  | "vault-overview-lab-simple"
  | "vault-overview-lab-monorepo"
  | "vault-overview-lab-stress"
  | "vault-overview-lab-attention";

export type VaultOverviewDesignLabPage = "overview" | "settings";

type ResourceKind = "cloudflare" | "convex";
type ResourceState = "attention" | "building" | "live" | "ready" | "reused" | "unavailable";
type EventState = "attention" | "building" | "live" | "ready";

type LabDestination = {
  label: string;
  url: string;
};

type LabResource =
  | {
      kind: "cloudflare";
      accountId: string;
      accountName: string;
      destinations: readonly LabDestination[];
      label: string;
      relationship: string | null;
      state: ResourceState;
      stateLabel: string;
    }
  | {
      kind: "convex";
      destinations: readonly LabDestination[];
      label: string;
      relationship: string | null;
      state: ResourceState;
      stateLabel: string;
      teamSlug: string;
    };

type LabRootGroup = {
  rootDirectory: string;
  resources: readonly LabResource[];
};

type LabPullRequest = {
  author: string;
  branch: string;
  checks: LabChecks;
  checksLabel: string;
  details: {
    baseBranch: string;
    changeSummary: string;
    changesUrl: string;
    labels: readonly string[];
  } | null;
  number: number;
  rootSummary: string;
  roots: readonly LabRootGroup[];
  state: EventState;
  stateLabel: string;
  title: string;
  updatedAt: string;
};

type LabAlert = {
  detail: string;
  title: string;
};

type LabSettingsIssue = {
  actionLabel: string;
  detail: string;
  resource: LabResource;
  rootDirectory: string;
};

type LabScenario = {
  alert: LabAlert | null;
  commit: {
    author: string;
    checks: LabChecks;
    checksLabel: string;
    hash: string;
    state: EventState;
    title: string;
    updatedAt: string;
  };
  defaultBranch: string;
  defaultExpandedPullRequest: number | null;
  label: string;
  productionRoots: readonly LabRootGroup[];
  productionVisibleRootCount: number;
  pullRequests: readonly LabPullRequest[];
  repositoryName: string;
  repositoryOwner: string;
  repositoryUrl: string;
  settingsIssues: readonly LabSettingsIssue[];
};

type LabChecks = Pick<VaultDefaultBranchChecks, "checks" | "statusCheckRollup">;

function labChecks({
  failureCount,
  runningCount,
  successCount,
}: {
  failureCount: number;
  runningCount: number;
  successCount: number;
}): LabChecks {
  const totalCount = failureCount + runningCount + successCount;
  const state = failureCount > 0 ? "failure" : runningCount > 0 ? "running" : "success";

  return {
    checks: {
      state,
      totalCount,
      successCount,
      failureCount,
      runningCount,
      neutralCount: 0,
      unknownCount: 0,
    },
    statusCheckRollup: {
      state: failureCount > 0 ? "FAILURE" : runningCount > 0 ? "PENDING" : "SUCCESS",
      contexts: {
        totalCount,
        checkRunCount: totalCount,
        statusContextCount: 0,
        checkRunCountsByState: [
          ...(failureCount > 0 ? [{ state: "FAILURE", count: failureCount } as const] : []),
          ...(runningCount > 0 ? [{ state: "IN_PROGRESS", count: runningCount } as const] : []),
          ...(successCount > 0 ? [{ state: "SUCCESS", count: successCount } as const] : []),
        ],
        statusContextCountsByState: [],
        nodes: [
          {
            kind: "check_run",
            name: "Tests",
            status: "COMPLETED",
            conclusion: failureCount > 0 ? "FAILURE" : "SUCCESS",
            detailsUrl: "https://github.com/samebase/samebase/actions",
            title: null,
          },
          {
            kind: "check_run",
            name: "Cloudflare Workers Builds",
            status: runningCount > 0 ? "IN_PROGRESS" : "COMPLETED",
            conclusion: runningCount > 0 ? null : failureCount > 0 ? "FAILURE" : "SUCCESS",
            detailsUrl: "https://dash.cloudflare.com/",
            title: null,
          },
        ],
      },
    },
  };
}

const LAB_MODES = [
  { label: "Simple", mode: "vault-overview-lab-simple" },
  { label: "Monorepo", mode: "vault-overview-lab-monorepo" },
  { label: "Large", mode: "vault-overview-lab-stress" },
  { label: "Attention", mode: "vault-overview-lab-attention" },
] as const satisfies readonly {
  label: string;
  mode: VaultOverviewDesignLabVisualMode;
}[];

const RESOURCE_STATE_STYLE = {
  attention: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    status: "flex items-center gap-1.5 text-xs font-medium text-red-700",
  },
  building: {
    icon: <LoaderCircle className="h-3.5 w-3.5" />,
    status: "flex items-center gap-1.5 text-xs font-medium text-amber-700",
  },
  live: {
    icon: <Check className="h-3.5 w-3.5" />,
    status: "flex items-center gap-1.5 text-xs font-medium text-emerald-700",
  },
  ready: {
    icon: <Check className="h-3.5 w-3.5" />,
    status: "flex items-center gap-1.5 text-xs font-medium text-emerald-700",
  },
  reused: {
    icon: <Check className="h-3.5 w-3.5" />,
    status: "flex items-center gap-1.5 text-xs font-medium text-muted-foreground",
  },
  unavailable: {
    icon: <CircleDot className="h-3.5 w-3.5" />,
    status: "flex items-center gap-1.5 text-xs font-medium text-muted-foreground",
  },
} satisfies Record<
  ResourceState,
  {
    icon: ReactNode;
    status: string;
  }
>;

const EVENT_STATE_STYLE = {
  attention: {
    dot: "h-2 w-2 bg-red-500",
    status: "inline-flex items-center gap-1.5 text-xs font-medium text-red-700",
  },
  building: {
    dot: "h-2 w-2 bg-amber-500",
    status: "inline-flex items-center gap-1.5 text-xs font-medium text-amber-700",
  },
  live: {
    dot: "h-2 w-2 bg-emerald-500",
    status: "inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700",
  },
  ready: {
    dot: "h-2 w-2 bg-emerald-500",
    status: "inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700",
  },
} satisfies Record<EventState, { dot: string; status: string }>;

const SAMEBASE_CLOUDFLARE_ACCOUNT = {
  accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
  accountName: "Samebase",
} as const;

const COMMERCE_CLOUDFLARE_ACCOUNT = {
  accountId: "commerce-platform",
  accountName: "Commerce Platform",
} as const;

const NOTER_CLOUDFLARE_ACCOUNT = {
  accountId: "noter-guest",
  accountName: "Noter Guest",
} as const;

const MONOREPO_PRODUCTION_ROOTS = [
  {
    rootDirectory: "apps/domain-router",
    resources: [
      {
        kind: "cloudflare",
        ...SAMEBASE_CLOUDFLARE_ACCOUNT,
        destinations: [
          {
            label: "workers.dev",
            url: "https://domain-router.samebase.workers.dev",
          },
        ],
        label: "domain-router",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
  {
    rootDirectory: "apps/posthog-proxy",
    resources: [
      {
        kind: "cloudflare",
        ...SAMEBASE_CLOUDFLARE_ACCOUNT,
        destinations: [],
        label: "posthog-proxy",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
  {
    rootDirectory: "apps/samebase",
    resources: [
      {
        kind: "cloudflare",
        ...SAMEBASE_CLOUDFLARE_ACCOUNT,
        destinations: [
          { label: "Custom domain", url: "https://samebase.com" },
          {
            label: "workers.dev",
            url: "https://samebase-worker.samebase.workers.dev",
          },
        ],
        label: "samebase-worker",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
      {
        kind: "convex",
        destinations: [
          {
            label: "Data",
            url: "https://dashboard.convex.dev/t/samebase/samebase/data",
          },
          {
            label: "Schema",
            url: "https://dashboard.convex.dev/t/samebase/samebase/schema",
          },
        ],
        label: "samebase",
        relationship: null,
        state: "live",
        stateLabel: "Live",
        teamSlug: "samebase",
      },
    ],
  },
] satisfies readonly LabRootGroup[];

const MONOREPO_PULL_REQUESTS = [
  {
    author: "nicu",
    branch: "codex/discover-default-layout-convex-projects",
    checks: labChecks({ failureCount: 0, runningCount: 0, successCount: 14 }),
    checksLabel: "14/14 checks",
    details: null,
    number: 1263,
    rootSummary: "1 preview",
    roots: [
      {
        rootDirectory: "apps/samebase",
        resources: [
          {
            kind: "cloudflare",
            ...SAMEBASE_CLOUDFLARE_ACCOUNT,
            destinations: [
              {
                label: "Preview",
                url: "https://1263.samebase.workers.dev",
              },
            ],
            label: "samebase-worker",
            relationship: "Convex preview verified from this build",
            state: "ready",
            stateLabel: "Preview ready",
          },
        ],
      },
    ],
    state: "ready",
    stateLabel: "Ready",
    title: "Discover default-layout Convex projects",
    updatedAt: "18 min ago",
  },
  {
    author: "codex",
    branch: "codex/pr-observation-model",
    checks: labChecks({ failureCount: 0, runningCount: 5, successCount: 9 }),
    checksLabel: "9/14 checks",
    details: null,
    number: 1262,
    rootSummary: "2 previews",
    roots: [
      {
        rootDirectory: "apps/domain-router",
        resources: [
          {
            kind: "cloudflare",
            ...SAMEBASE_CLOUDFLARE_ACCOUNT,
            destinations: [
              {
                label: "Preview",
                url: "https://1262.domain-router.workers.dev",
              },
            ],
            label: "domain-router",
            relationship: null,
            state: "ready",
            stateLabel: "Preview ready",
          },
        ],
      },
      {
        rootDirectory: "apps/samebase",
        resources: [
          {
            kind: "cloudflare",
            ...SAMEBASE_CLOUDFLARE_ACCOUNT,
            destinations: [],
            label: "samebase-worker",
            relationship: "Waiting for the verified Convex preview",
            state: "building",
            stateLabel: "Building",
          },
        ],
      },
    ],
    state: "building",
    stateLabel: "Building",
    title: "Keep preview observations tied to their commit",
    updatedAt: "42 min ago",
  },
  {
    author: "claude",
    branch: "claude/workspace-scroll",
    checks: labChecks({ failureCount: 0, runningCount: 0, successCount: 14 }),
    checksLabel: "14/14 checks",
    details: null,
    number: 1259,
    rootSummary: "No preview needed",
    roots: [
      {
        rootDirectory: "apps/samebase",
        resources: [
          {
            kind: "cloudflare",
            ...SAMEBASE_CLOUDFLARE_ACCOUNT,
            destinations: [{ label: "Production", url: "https://samebase.com" }],
            label: "samebase-worker",
            relationship: null,
            state: "reused",
            stateLabel: "No preview needed",
          },
        ],
      },
    ],
    state: "ready",
    stateLabel: "Ready",
    title: "Tighten workspace pane scroll behavior",
    updatedAt: "3 hr ago",
  },
] satisfies readonly LabPullRequest[];

const STRESS_PRODUCTION_ROOTS = [
  {
    rootDirectory: "/",
    resources: [
      {
        kind: "cloudflare",
        ...COMMERCE_CLOUDFLARE_ACCOUNT,
        destinations: [],
        label: "commerce-edge",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
  {
    rootDirectory: "apps/accounts",
    resources: [
      {
        kind: "convex",
        destinations: [],
        label: "accounts",
        relationship: null,
        state: "live",
        stateLabel: "Live",
        teamSlug: "commerce-platform",
      },
    ],
  },
  {
    rootDirectory: "apps/admin",
    resources: [
      {
        kind: "cloudflare",
        ...COMMERCE_CLOUDFLARE_ACCOUNT,
        destinations: [
          {
            label: "Custom domain",
            url: "https://admin.commerce.example",
          },
        ],
        label: "commerce-admin",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
  {
    rootDirectory: "apps/analytics",
    resources: [
      {
        kind: "cloudflare",
        ...COMMERCE_CLOUDFLARE_ACCOUNT,
        destinations: [],
        label: "commerce-analytics",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
  {
    rootDirectory: "apps/catalog",
    resources: [
      {
        kind: "convex",
        destinations: [],
        label: "catalog",
        relationship: null,
        state: "live",
        stateLabel: "Live",
        teamSlug: "commerce-platform",
      },
    ],
  },
  {
    rootDirectory: "apps/checkout",
    resources: [
      {
        kind: "cloudflare",
        ...COMMERCE_CLOUDFLARE_ACCOUNT,
        destinations: [
          {
            label: "Custom domain",
            url: "https://checkout.commerce.example",
          },
        ],
        label: "commerce-checkout",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
      {
        kind: "convex",
        destinations: [],
        label: "checkout",
        relationship: null,
        state: "live",
        stateLabel: "Live",
        teamSlug: "commerce-platform",
      },
    ],
  },
  {
    rootDirectory: "apps/content",
    resources: [
      {
        kind: "cloudflare",
        ...COMMERCE_CLOUDFLARE_ACCOUNT,
        destinations: [],
        label: "commerce-content",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
  {
    rootDirectory: "apps/notifications",
    resources: [
      {
        kind: "convex",
        destinations: [],
        label: "notifications",
        relationship: null,
        state: "live",
        stateLabel: "Live",
        teamSlug: "commerce-platform",
      },
    ],
  },
  {
    rootDirectory: "apps/search",
    resources: [
      {
        kind: "cloudflare",
        ...COMMERCE_CLOUDFLARE_ACCOUNT,
        destinations: [],
        label: "commerce-search",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
  {
    rootDirectory: "apps/storefront",
    resources: [
      {
        kind: "cloudflare",
        ...COMMERCE_CLOUDFLARE_ACCOUNT,
        destinations: [
          {
            label: "Custom domain",
            url: "https://commerce.example",
          },
          {
            label: "workers.dev",
            url: "https://commerce-storefront.commerce-platform.workers.dev",
          },
        ],
        label: "commerce-storefront",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
      {
        kind: "cloudflare",
        ...COMMERCE_CLOUDFLARE_ACCOUNT,
        destinations: [],
        label: "commerce-images",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
      {
        kind: "convex",
        destinations: [
          {
            label: "Data",
            url: "https://dashboard.convex.dev/t/commerce-platform/storefront/data",
          },
        ],
        label: "storefront",
        relationship: null,
        state: "live",
        stateLabel: "Live",
        teamSlug: "commerce-platform",
      },
    ],
  },
  {
    rootDirectory: "services/email",
    resources: [
      {
        kind: "cloudflare",
        ...COMMERCE_CLOUDFLARE_ACCOUNT,
        destinations: [],
        label: "commerce-email",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
  {
    rootDirectory: "services/webhooks",
    resources: [
      {
        kind: "cloudflare",
        ...COMMERCE_CLOUDFLARE_ACCOUNT,
        destinations: [],
        label: "commerce-webhooks",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
] satisfies readonly LabRootGroup[];

const STRESS_PULL_REQUESTS = [
  {
    author: "maya",
    branch: "maya/checkout-retries",
    checks: labChecks({ failureCount: 0, runningCount: 3, successCount: 21 }),
    checksLabel: "21/24 checks",
    details: {
      baseBranch: "main",
      changeSummary: "+184 −42 · 7 files",
      changesUrl:
        "https://samebase.com/vault/samebase/commerce-order-fulfillment-platform/pull/842",
      labels: ["needs review", "customer"],
    },
    number: 842,
    rootSummary: "2 previews",
    roots: [
      {
        rootDirectory: "apps/checkout",
        resources: [
          {
            kind: "cloudflare",
            ...COMMERCE_CLOUDFLARE_ACCOUNT,
            destinations: [
              {
                label: "Preview",
                url: "https://842.checkout.commerce.example",
              },
              {
                label: "Build logs",
                url: "https://dash.cloudflare.com/?to=/commerce-platform/workers/builds/commerce-checkout/842",
              },
            ],
            label: "commerce-checkout",
            relationship: "Convex preview verified from this build",
            state: "ready",
            stateLabel: "Preview ready",
          },
          {
            kind: "convex",
            destinations: [
              {
                label: "Preview deployment",
                url: "https://dashboard.convex.dev/t/commerce-platform/checkout/precise-otter-842",
              },
              {
                label: "Data",
                url: "https://dashboard.convex.dev/t/commerce-platform/checkout/precise-otter-842/data",
              },
            ],
            label: "precise-otter-842",
            relationship: "Verified from the commerce-checkout build",
            state: "ready",
            stateLabel: "Preview ready",
            teamSlug: "commerce-platform",
          },
        ],
      },
      {
        rootDirectory: "apps/storefront",
        resources: [
          {
            kind: "cloudflare",
            ...COMMERCE_CLOUDFLARE_ACCOUNT,
            destinations: [
              {
                label: "Preview",
                url: "https://842.commerce.example",
              },
              {
                label: "Build logs",
                url: "https://dash.cloudflare.com/?to=/commerce-platform/workers/builds/commerce-storefront/842",
              },
            ],
            label: "commerce-storefront",
            relationship: null,
            state: "ready",
            stateLabel: "Preview ready",
          },
          {
            kind: "cloudflare",
            ...COMMERCE_CLOUDFLARE_ACCOUNT,
            destinations: [
              {
                label: "Build logs",
                url: "https://dash.cloudflare.com/?to=/commerce-platform/workers/builds/commerce-images/842",
              },
            ],
            label: "commerce-images",
            relationship: null,
            state: "unavailable",
            stateLabel: "Unavailable",
          },
        ],
      },
    ],
    state: "building",
    stateLabel: "3 checks running",
    title: "Make checkout retries idempotent",
    updatedAt: "9 min ago",
  },
  {
    author: "leo",
    branch: "leo/search-index-refresh",
    checks: labChecks({ failureCount: 0, runningCount: 0, successCount: 24 }),
    checksLabel: "24/24 checks",
    details: null,
    number: 841,
    rootSummary: "1 preview",
    roots: [
      {
        rootDirectory: "apps/search",
        resources: [
          {
            kind: "cloudflare",
            ...COMMERCE_CLOUDFLARE_ACCOUNT,
            destinations: [
              {
                label: "Preview",
                url: "https://841.search.commerce.example",
              },
            ],
            label: "commerce-search",
            relationship: null,
            state: "ready",
            stateLabel: "Preview ready",
          },
        ],
      },
    ],
    state: "ready",
    stateLabel: "Ready",
    title: "Refresh search indexes after catalog imports",
    updatedAt: "26 min ago",
  },
  {
    author: "sana",
    branch: "sana/payment-email-copy",
    checks: labChecks({ failureCount: 0, runningCount: 0, successCount: 24 }),
    checksLabel: "24/24 checks",
    details: null,
    number: 839,
    rootSummary: "No preview needed",
    roots: [
      {
        rootDirectory: "services/email",
        resources: [
          {
            kind: "cloudflare",
            ...COMMERCE_CLOUDFLARE_ACCOUNT,
            destinations: [],
            label: "commerce-email",
            relationship: null,
            state: "reused",
            stateLabel: "No preview needed",
          },
        ],
      },
    ],
    state: "ready",
    stateLabel: "Ready",
    title: "Clarify failed payment emails",
    updatedAt: "1 hr ago",
  },
  {
    author: "owen",
    branch: "owen/bulk-catalog-editing",
    checks: labChecks({ failureCount: 0, runningCount: 6, successCount: 18 }),
    checksLabel: "18/24 checks",
    details: null,
    number: 837,
    rootSummary: "1 preview",
    roots: [
      {
        rootDirectory: "apps/admin",
        resources: [
          {
            kind: "cloudflare",
            ...COMMERCE_CLOUDFLARE_ACCOUNT,
            destinations: [
              {
                label: "Build logs",
                url: "https://dash.cloudflare.com/?to=/commerce-platform/workers/builds/commerce-admin/837",
              },
            ],
            label: "commerce-admin",
            relationship: null,
            state: "building",
            stateLabel: "Building",
          },
        ],
      },
    ],
    state: "building",
    stateLabel: "6 checks running",
    title: "Add bulk catalog editing",
    updatedAt: "2 hr ago",
  },
  {
    author: "mia",
    branch: "mia/refund-conversion",
    checks: labChecks({ failureCount: 0, runningCount: 0, successCount: 24 }),
    checksLabel: "24/24 checks",
    details: null,
    number: 836,
    rootSummary: "No preview available",
    roots: [
      {
        rootDirectory: "apps/analytics",
        resources: [
          {
            kind: "cloudflare",
            ...COMMERCE_CLOUDFLARE_ACCOUNT,
            destinations: [],
            label: "commerce-analytics",
            relationship: null,
            state: "unavailable",
            stateLabel: "Unavailable",
          },
        ],
      },
    ],
    state: "ready",
    stateLabel: "Ready",
    title: "Track refund conversion separately",
    updatedAt: "4 hr ago",
  },
  {
    author: "noah",
    branch: "noah/webhook-jitter",
    checks: labChecks({ failureCount: 0, runningCount: 0, successCount: 24 }),
    checksLabel: "24/24 checks",
    details: null,
    number: 832,
    rootSummary: "1 preview",
    roots: [
      {
        rootDirectory: "services/webhooks",
        resources: [
          {
            kind: "cloudflare",
            ...COMMERCE_CLOUDFLARE_ACCOUNT,
            destinations: [
              {
                label: "Preview",
                url: "https://832.webhooks.commerce.example",
              },
            ],
            label: "commerce-webhooks",
            relationship: null,
            state: "ready",
            stateLabel: "Preview ready",
          },
        ],
      },
    ],
    state: "ready",
    stateLabel: "Ready",
    title: "Retry partner webhooks with jitter",
    updatedAt: "yesterday",
  },
] satisfies readonly LabPullRequest[];

const SCENARIOS = {
  "vault-overview-lab-simple": {
    alert: null,
    commit: {
      author: "noter-guest",
      checks: labChecks({ failureCount: 0, runningCount: 0, successCount: 6 }),
      checksLabel: "6/6 checks",
      hash: "8f2ac16",
      state: "ready",
      title: "Polish the empty guestbook state",
      updatedAt: "11 min ago",
    },
    defaultBranch: "main",
    defaultExpandedPullRequest: 48,
    label: "Simple app",
    productionRoots: [
      {
        rootDirectory: "/",
        resources: [
          {
            kind: "cloudflare",
            ...NOTER_CLOUDFLARE_ACCOUNT,
            destinations: [
              {
                label: "Custom domain",
                url: "https://guestbook.samebase.app",
              },
            ],
            label: "guestbook",
            relationship: null,
            state: "live",
            stateLabel: "Live",
          },
          {
            kind: "convex",
            destinations: [
              {
                label: "Data",
                url: "https://dashboard.convex.dev/t/noter-guest/guestbook/data",
              },
            ],
            label: "guestbook",
            relationship: null,
            state: "live",
            stateLabel: "Live",
            teamSlug: "noter-guest",
          },
        ],
      },
    ],
    productionVisibleRootCount: 1,
    pullRequests: [
      {
        author: "noter-guest",
        branch: "noter/sort-guestbook-entries",
        checks: labChecks({ failureCount: 0, runningCount: 0, successCount: 6 }),
        checksLabel: "6/6 checks",
        details: null,
        number: 48,
        rootSummary: "1 preview",
        roots: [
          {
            rootDirectory: "/",
            resources: [
              {
                kind: "cloudflare",
                ...NOTER_CLOUDFLARE_ACCOUNT,
                destinations: [
                  {
                    label: "Preview",
                    url: "https://48.guestbook.samebase.app",
                  },
                ],
                label: "guestbook",
                relationship: "Convex preview verified from this build",
                state: "ready",
                stateLabel: "Preview ready",
              },
            ],
          },
        ],
        state: "ready",
        stateLabel: "Ready",
        title: "Make guestbook entries sortable by creation date and author without changing links",
        updatedAt: "34 min ago",
      },
    ],
    repositoryName: "guestbook",
    repositoryOwner: "noter-guest",
    repositoryUrl: "https://github.com/noter-guest/guestbook",
    settingsIssues: [],
  },
  "vault-overview-lab-monorepo": {
    alert: null,
    commit: {
      author: "nicu",
      checks: labChecks({ failureCount: 0, runningCount: 0, successCount: 14 }),
      checksLabel: "14/14 checks",
      hash: "9111562",
      state: "ready",
      title: "Discover default-layout Convex projects",
      updatedAt: "23 min ago",
    },
    defaultBranch: "main",
    defaultExpandedPullRequest: 1263,
    label: "Monorepo",
    productionRoots: MONOREPO_PRODUCTION_ROOTS,
    productionVisibleRootCount: 3,
    pullRequests: MONOREPO_PULL_REQUESTS,
    repositoryName: "samebase",
    repositoryOwner: "samebase",
    repositoryUrl: "https://github.com/samebase/samebase",
    settingsIssues: [],
  },
  "vault-overview-lab-stress": {
    alert: null,
    commit: {
      author: "maya",
      checks: labChecks({ failureCount: 0, runningCount: 0, successCount: 24 }),
      checksLabel: "24/24 checks",
      hash: "4ad90cb",
      state: "ready",
      title: "Keep fulfillment events ordered across regions",
      updatedAt: "7 min ago",
    },
    defaultBranch: "main",
    defaultExpandedPullRequest: 842,
    label: "Large monorepo",
    productionRoots: STRESS_PRODUCTION_ROOTS,
    productionVisibleRootCount: 5,
    pullRequests: STRESS_PULL_REQUESTS,
    repositoryName: "commerce-order-fulfillment-platform",
    repositoryOwner: "samebase",
    repositoryUrl: "https://github.com/samebase/commerce-order-fulfillment-platform",
    settingsIssues: [
      {
        actionLabel: "Configure Builds",
        detail: "Workers Builds is not connected to apps/storefront, so new previews cannot build.",
        resource: {
          kind: "cloudflare",
          ...COMMERCE_CLOUDFLARE_ACCOUNT,
          destinations: [],
          label: "commerce-images",
          relationship: null,
          state: "attention",
          stateLabel: "Builds not configured",
        },
        rootDirectory: "apps/storefront",
      },
      {
        actionLabel: "Repair deploy keys",
        detail:
          "The preview deploy key no longer matches the Convex project used by the production branch.",
        resource: {
          kind: "convex",
          destinations: [],
          label: "catalog",
          relationship: null,
          state: "attention",
          stateLabel: "Deploy keys need repair",
          teamSlug: "commerce-platform",
        },
        rootDirectory: "apps/catalog",
      },
    ],
  },
  "vault-overview-lab-attention": {
    alert: {
      detail: "The provider observation still exists, but its verified repository root is missing.",
      title: "plugin-preview-router needs a root before new previews can build",
    },
    commit: {
      author: "nicu",
      checks: labChecks({ failureCount: 1, runningCount: 0, successCount: 13 }),
      checksLabel: "13/14 checks",
      hash: "a12fbc8",
      state: "attention",
      title: "Keep plugin preview URLs stable across renames",
      updatedAt: "16 min ago",
    },
    defaultBranch: "main",
    defaultExpandedPullRequest: 217,
    label: "Needs attention",
    productionRoots: [
      {
        rootDirectory: "Needs attention",
        resources: [
          {
            kind: "cloudflare",
            ...SAMEBASE_CLOUDFLARE_ACCOUNT,
            destinations: [],
            label: "plugin-preview-router",
            relationship: null,
            state: "attention",
            stateLabel: "Root missing",
          },
        ],
      },
      {
        rootDirectory: "packages/codex-plugin",
        resources: [
          {
            kind: "cloudflare",
            ...SAMEBASE_CLOUDFLARE_ACCOUNT,
            destinations: [
              {
                label: "Custom domain",
                url: "https://plugins.samebase.com",
              },
            ],
            label: "plugin-directory",
            relationship: null,
            state: "live",
            stateLabel: "Live",
          },
        ],
      },
      {
        rootDirectory: "packages/registry",
        resources: [
          {
            kind: "convex",
            destinations: [],
            label: "plugin-registry",
            relationship: null,
            state: "live",
            stateLabel: "Live",
            teamSlug: "samebase",
          },
        ],
      },
    ],
    productionVisibleRootCount: 3,
    pullRequests: [
      {
        author: "nicu",
        branch: "codex/plugin-preview-router",
        checks: labChecks({ failureCount: 1, runningCount: 2, successCount: 11 }),
        checksLabel: "11/14 checks",
        details: null,
        number: 217,
        rootSummary: "1 resource needs attention",
        roots: [
          {
            rootDirectory: "Needs attention",
            resources: [
              {
                kind: "cloudflare",
                ...SAMEBASE_CLOUDFLARE_ACCOUNT,
                destinations: [
                  {
                    label: "Build logs",
                    url: "https://dash.cloudflare.com/?to=/samebase/workers/builds/plugin-preview-router/217",
                  },
                ],
                label: "plugin-preview-router",
                relationship: null,
                state: "attention",
                stateLabel: "Root missing",
              },
            ],
          },
          {
            rootDirectory: "packages/codex-plugin",
            resources: [
              {
                kind: "cloudflare",
                ...SAMEBASE_CLOUDFLARE_ACCOUNT,
                destinations: [
                  {
                    label: "Preview",
                    url: "https://217.plugins.samebase.com",
                  },
                ],
                label: "plugin-directory",
                relationship: null,
                state: "ready",
                stateLabel: "Preview ready",
              },
            ],
          },
        ],
        state: "attention",
        stateLabel: "Action needed",
        title: "Repair preview routing for renamed plugins",
        updatedAt: "29 min ago",
      },
      {
        author: "codex",
        branch: "codex/plugin-compatibility-metadata",
        checks: labChecks({ failureCount: 0, runningCount: 0, successCount: 8 }),
        checksLabel: "8/8 checks",
        details: null,
        number: 214,
        rootSummary: "1 preview",
        roots: [
          {
            rootDirectory: "packages/registry",
            resources: [
              {
                kind: "cloudflare",
                ...SAMEBASE_CLOUDFLARE_ACCOUNT,
                destinations: [
                  {
                    label: "Preview",
                    url: "https://214.registry.samebase.com",
                  },
                ],
                label: "plugin-registry-api",
                relationship: "Convex preview verified from this build",
                state: "ready",
                stateLabel: "Preview ready",
              },
            ],
          },
        ],
        state: "ready",
        stateLabel: "Ready",
        title: "Expose plugin compatibility metadata",
        updatedAt: "2 hr ago",
      },
    ],
    repositoryName: "agent-plugins",
    repositoryOwner: "samebase",
    repositoryUrl: "https://github.com/samebase/agent-plugins",
    settingsIssues: [
      {
        actionLabel: "Choose code location",
        detail: "The Worker no longer has a verified repository root for new preview builds.",
        resource: {
          kind: "cloudflare",
          ...SAMEBASE_CLOUDFLARE_ACCOUNT,
          destinations: [],
          label: "plugin-preview-router",
          relationship: null,
          state: "attention",
          stateLabel: "Root missing",
        },
        rootDirectory: "Unknown root",
      },
      {
        actionLabel: "Repair deploy keys",
        detail: "Production and preview deploy keys point to different Convex projects.",
        resource: {
          kind: "convex",
          destinations: [],
          label: "plugin-registry",
          relationship: null,
          state: "attention",
          stateLabel: "Deploy keys need repair",
          teamSlug: "samebase",
        },
        rootDirectory: "packages/registry",
      },
    ],
  },
} satisfies Record<VaultOverviewDesignLabVisualMode, LabScenario>;

function ResourceIcon({ kind }: { kind: ResourceKind }) {
  switch (kind) {
    case "cloudflare":
      return <CloudflareProviderLogo />;
    case "convex":
      return <ConvexProviderLogo />;
    default:
      kind satisfies never;
      return null;
  }
}

function resourceDashboardUrl(resource: LabResource) {
  switch (resource.kind) {
    case "cloudflare":
      return `https://dash.cloudflare.com/?to=/${encodeURIComponent(resource.accountId)}/workers/services/view/${encodeURIComponent(resource.label)}/production/settings`;
    case "convex":
      return `https://dashboard.convex.dev/t/${encodeURIComponent(resource.teamSlug)}/${encodeURIComponent(resource.label)}/settings`;
    default:
      resource satisfies never;
      return "";
  }
}

function resourceOwner(resource: LabResource) {
  switch (resource.kind) {
    case "cloudflare":
      return resource.accountName;
    case "convex":
      return resource.teamSlug;
    default:
      resource satisfies never;
      return "";
  }
}

function ResourceDestinationLinks({ resource }: { resource: LabResource }) {
  if (resource.destinations.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1">
      {resource.destinations.map((destination) => (
        <a
          key={`${destination.label}-${destination.url}`}
          aria-label={`Open ${resource.label} ${destination.label}`}
          className="inline-flex min-h-7 items-center gap-1 text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
          href={destination.url}
          rel="noreferrer"
          target="_blank"
        >
          {destination.label}
          <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

function ResourceRow({
  resource,
  showLiveStatus,
}: {
  resource: LabResource;
  showLiveStatus: boolean;
}) {
  const style = RESOURCE_STATE_STYLE[resource.state];

  return (
    <div className="grid min-w-0 gap-2 py-2.5 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-center">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          aria-label={resource.kind === "cloudflare" ? "Cloudflare" : "Convex"}
          className="mt-0.5 flex h-4 w-5 shrink-0 items-center justify-center"
          role="img"
        >
          <ResourceIcon kind={resource.kind} />
        </span>
        <div className="min-w-0">
          <a
            className="block min-w-0 truncate text-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            href={resourceDashboardUrl(resource)}
            rel="noreferrer"
            target="_blank"
          >
            {resource.label}
          </a>
          <ResourceDestinationLinks resource={resource} />
          {resource.relationship ? (
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              {resource.relationship}
            </div>
          ) : null}
        </div>
      </div>
      {showLiveStatus || resource.state !== "live" ? (
        <div className={style.status}>
          {style.icon}
          {resource.stateLabel}
        </div>
      ) : null}
    </div>
  );
}

function RootDirectoryLabel({
  needsAttention,
  rootDirectory,
}: {
  needsAttention: boolean;
  rootDirectory: string;
}) {
  return (
    <span
      className={
        needsAttention
          ? "block font-mono text-sm font-semibold text-red-700 [overflow-wrap:anywhere]"
          : "block font-mono text-sm font-semibold text-foreground [overflow-wrap:anywhere]"
      }
    >
      {rootDirectory}
    </span>
  );
}

function RootGroup({
  group,
  hideRootDirectory,
  separateRoots,
  showLiveStatus,
}: {
  group: LabRootGroup;
  hideRootDirectory: boolean;
  separateRoots: boolean;
  showLiveStatus: boolean;
}) {
  return (
    <div
      className={separateRoots ? "relative border-b border-border/50 last:border-b-0" : "relative"}
    >
      <span
        aria-hidden="true"
        className="absolute -left-5 top-[1.35rem] w-4 border-t border-border"
      />
      {hideRootDirectory ? null : (
        <div className="pt-3" data-root-directory={group.rootDirectory}>
          <RootDirectoryLabel
            needsAttention={group.rootDirectory === "Needs attention"}
            rootDirectory={group.rootDirectory}
          />
        </div>
      )}
      <div className={hideRootDirectory ? "py-0.5" : "pb-0.5"}>
        {group.resources.map((resource) => (
          <ResourceRow
            key={`${resource.kind}-${resource.label}`}
            resource={resource}
            showLiveStatus={showLiveStatus}
          />
        ))}
      </div>
    </div>
  );
}

function RootRail({
  roots,
  separateRoots,
  showLiveStatus,
}: {
  roots: readonly LabRootGroup[];
  separateRoots: boolean;
  showLiveStatus: boolean;
}) {
  const hideRootDirectory = roots.length === 1 && roots[0]?.rootDirectory === "/";

  return (
    <div className="ml-2.5 border-l border-border pl-5">
      {roots.map((root) => (
        <RootGroup
          key={root.rootDirectory}
          group={root}
          hideRootDirectory={hideRootDirectory}
          separateRoots={separateRoots}
          showLiveStatus={showLiveStatus}
        />
      ))}
    </div>
  );
}

function LabHeader({
  mode,
  page,
  scenario,
}: {
  mode: VaultOverviewDesignLabVisualMode;
  page: VaultOverviewDesignLabPage;
  scenario: LabScenario;
}) {
  return (
    <div className="flex h-full min-w-0 flex-1 items-center gap-3 overflow-x-auto px-2">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground @3xl:hidden">
        Lab
      </span>
      <span className="hidden shrink-0 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground @3xl:inline">
        Vault overview lab
      </span>
      <div className="flex h-full items-center">
        {LAB_MODES.map((option) => {
          const active = option.mode === mode;
          return (
            <Link
              key={option.mode}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "flex h-full items-center border-b-2 border-foreground px-2 text-xs font-medium text-foreground"
                  : "flex h-full items-center border-b-2 border-transparent px-2 text-xs text-muted-foreground hover:text-foreground"
              }
              search={(current) => ({
                ...current,
                mode: option.mode,
                view: page === "settings" ? "settings" : undefined,
              })}
              to="/visual-fixture"
            >
              {option.label}
            </Link>
          );
        })}
      </div>
      <span className="ml-auto hidden shrink-0 text-xs text-muted-foreground @4xl:inline">
        {scenario.label}
      </span>
    </div>
  );
}

function VaultSidebar({
  mode,
  page,
}: {
  mode: VaultOverviewDesignLabVisualMode;
  page: VaultOverviewDesignLabPage;
}) {
  return (
    <nav aria-label="Vaults" className="@container min-h-full py-2">
      {LAB_MODES.map((option) => {
        const scenario = SCENARIOS[option.mode];
        const active = option.mode === mode;
        let workerCount = 0;
        let convexProjectCount = 0;
        for (const root of scenario.productionRoots) {
          for (const resource of root.resources) {
            switch (resource.kind) {
              case "cloudflare":
                workerCount += 1;
                break;
              case "convex":
                convexProjectCount += 1;
                break;
              default:
                resource satisfies never;
            }
          }
        }
        const pullRequestCount = scenario.pullRequests.length;
        const commitStateStyle = EVENT_STATE_STYLE[scenario.commit.state];
        const compactChecksLabel = scenario.commit.checksLabel.replace(" checks", "");
        return (
          <Link
            key={option.mode}
            aria-label={`${scenario.repositoryOwner}/${scenario.repositoryName}, ${compactChecksLabel}, ${workerCount} ${workerCount === 1 ? "Cloudflare Worker" : "Cloudflare Workers"}, ${convexProjectCount} Convex ${convexProjectCount === 1 ? "project" : "projects"}${pullRequestCount > 0 ? `, ${pullRequestCount} ${pullRequestCount === 1 ? "PR" : "PRs"}` : ""}`}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "block min-w-0 bg-muted px-3 py-2.5 text-left no-underline hover:no-underline @max-[200px]:px-2 @max-[120px]:px-1"
                : "block min-w-0 px-3 py-2.5 text-left no-underline hover:bg-muted hover:no-underline @max-[200px]:px-2 @max-[120px]:px-1"
            }
            search={(current) => ({
              ...current,
              mode: option.mode,
              view: page === "settings" ? "settings" : undefined,
            })}
            title={`${scenario.repositoryOwner}/${scenario.repositoryName}`}
            to="/visual-fixture"
          >
            <span className="block min-w-0 text-sm leading-5">
              <span
                className="block min-w-0 truncate text-muted-foreground @max-[120px]:hidden"
                data-vault-sidebar-owner
              >
                {scenario.repositoryOwner}/
              </span>
              <span className="block min-w-0 line-clamp-2 font-medium text-foreground [overflow-wrap:anywhere]">
                {scenario.repositoryName}
              </span>
            </span>
            <span className="mt-1 flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
              <span className="mt-1 flex shrink-0">
                <span className={commitStateStyle.dot} />
              </span>
              <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">
                <span data-vault-sidebar-checks>{compactChecksLabel}</span>
                <span className="@max-[200px]:hidden" data-vault-sidebar-totals>
                  <span
                    aria-label={`${workerCount} Cloudflare Workers`}
                    className="inline-flex"
                    title={`${workerCount} Cloudflare Workers`}
                  >
                    {" · "}
                    {workerCount}
                    <span className="ml-1 inline-flex h-3 w-4 items-center justify-center">
                      <CloudflareProviderLogo />
                    </span>
                  </span>
                  <span
                    aria-label={`${convexProjectCount} Convex projects`}
                    className="inline-flex"
                    title={`${convexProjectCount} Convex projects`}
                  >
                    {" · "}
                    {convexProjectCount}
                    <span className="ml-1 inline-flex h-3 w-4 items-center justify-center">
                      <ConvexProviderLogo />
                    </span>
                  </span>
                  {pullRequestCount > 0
                    ? ` · ${pullRequestCount} ${pullRequestCount === 1 ? "PR" : "PRs"}`
                    : ""}
                </span>
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function RepositoryHeader({
  page,
  scenario,
}: {
  page: VaultOverviewDesignLabPage;
  scenario: LabScenario;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 @3xl:px-6 @5xl:px-8">
        <a
          aria-label={`Open ${scenario.repositoryOwner}/${scenario.repositoryName} on GitHub`}
          className="flex min-w-0 w-full items-start gap-2 text-left no-underline hover:no-underline @3xl:w-auto @3xl:flex-1"
          href={scenario.repositoryUrl}
          rel="noreferrer"
          target="_blank"
        >
          <div className="min-w-0 flex-1 text-base">
            <span className="block line-clamp-2 text-muted-foreground [overflow-wrap:anywhere] @3xl:inline">
              {scenario.repositoryOwner}/
            </span>
            <h1 className="block line-clamp-3 font-semibold text-foreground [overflow-wrap:anywhere] @3xl:ml-1 @3xl:inline">
              {scenario.repositoryName}
            </h1>
          </div>
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-foreground"
          >
            <GitHubProviderLogo />
          </span>
        </a>
        <nav aria-label="Repository" className="flex w-full items-center gap-1 @3xl:w-auto">
          <Link
            aria-current={page === "overview" ? "page" : undefined}
            className={
              page === "overview"
                ? "inline-flex min-h-8 items-center gap-1.5 bg-muted px-2 text-sm font-medium text-foreground no-underline hover:no-underline"
                : "inline-flex min-h-8 items-center gap-1.5 px-2 text-sm text-muted-foreground no-underline hover:bg-muted hover:text-foreground hover:no-underline"
            }
            search={(current) => ({ ...current, view: undefined })}
            to="/visual-fixture"
          >
            <LayoutList className="h-4 w-4" />
            Overview
          </Link>
          <Link
            aria-current={page === "settings" ? "page" : undefined}
            className={
              page === "settings"
                ? "inline-flex min-h-8 items-center gap-1.5 bg-muted px-2 text-sm font-medium text-foreground no-underline hover:no-underline"
                : "inline-flex min-h-8 items-center gap-1.5 px-2 text-sm text-muted-foreground no-underline hover:bg-muted hover:text-foreground hover:no-underline"
            }
            search={(current) => ({ ...current, view: "settings" })}
            to="/visual-fixture"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </nav>
      </div>
    </header>
  );
}

function AttentionNotice({ alert }: { alert: LabAlert }) {
  return (
    <div className="border border-red-200 bg-red-50 px-4 py-3 text-red-950">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
        <div className="min-w-0">
          <div className="text-sm font-medium">{alert.title}</div>
          <div className="mt-1 text-xs leading-5 text-red-800">{alert.detail}</div>
        </div>
      </div>
    </div>
  );
}

function DefaultBranchSection({ scenario }: { scenario: LabScenario }) {
  const [showAllRoots, setShowAllRoots] = useState(false);
  const visibleRoots = showAllRoots
    ? scenario.productionRoots
    : scenario.productionRoots.slice(0, scenario.productionVisibleRootCount);
  const hiddenRootCount = scenario.productionRoots.length - visibleRoots.length;

  return (
    <section aria-label="Default branch">
      <div className="border-b border-border pb-4">
        <div className="grid gap-3 @4xl:grid-cols-[minmax(0,1fr)_auto] @4xl:items-start">
          <div className="flex min-w-0 items-start gap-3">
            <GitCommitHorizontal className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <a
                  className="inline-flex min-h-8 items-center font-mono text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                  href={`${scenario.repositoryUrl}/tree/${scenario.defaultBranch}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {scenario.defaultBranch}
                </a>
                <span className="text-xs text-muted-foreground">·</span>
                <a
                  className="inline-flex min-h-8 items-center font-mono text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
                  href={`${scenario.repositoryUrl}/commit/${scenario.commit.hash}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {scenario.commit.hash}
                </a>
              </div>
              <div className="text-sm leading-6 text-foreground">{scenario.commit.title}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                {scenario.commit.author} · {scenario.commit.updatedAt}
              </div>
            </div>
          </div>
          <div className="justify-self-start @4xl:justify-self-end">
            <VaultChecksPopover
              checks={scenario.commit.checks.checks}
              detailsUrl={`${scenario.repositoryUrl}/commit/${scenario.commit.hash}/checks`}
              heading="Default branch checks"
              statusCheckRollup={scenario.commit.checks.statusCheckRollup}
              triggerTitle="Show default branch checks"
            />
          </div>
        </div>

        <div className="mt-3">
          <RootRail roots={visibleRoots} separateRoots={false} showLiveStatus={false} />
          {hiddenRootCount > 0 ? (
            <button
              className="ml-8 mt-2 text-xs font-medium text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
              type="button"
              onClick={() => setShowAllRoots(true)}
            >
              Show {hiddenRootCount} more apps
            </button>
          ) : showAllRoots &&
            scenario.productionRoots.length > scenario.productionVisibleRootCount ? (
            <button
              className="ml-8 mt-2 text-xs font-medium text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
              type="button"
              onClick={() => setShowAllRoots(false)}
            >
              Show fewer apps
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PullRequestSection({
  defaultExpandedPullRequest,
  pullRequests,
  repositoryUrl,
}: {
  defaultExpandedPullRequest: number | null;
  pullRequests: readonly LabPullRequest[];
  repositoryUrl: string;
}) {
  const [expandedPullRequest, setExpandedPullRequest] = useState<number | null>(
    defaultExpandedPullRequest,
  );

  return (
    <section aria-labelledby="vault-overview-pull-requests-heading">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2
          id="vault-overview-pull-requests-heading"
          className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          Open pull requests
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">{pullRequests.length}</span>
      </div>

      <div className="border-y border-border">
        {pullRequests.map((pullRequest) => {
          const expanded = expandedPullRequest === pullRequest.number;
          const stateStyle = EVENT_STATE_STYLE[pullRequest.state];
          return (
            <article key={pullRequest.number} className="border-b border-border last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start">
                <button
                  aria-expanded={expanded}
                  className="grid min-w-0 gap-3 py-4 pr-1 text-left @4xl:grid-cols-[minmax(0,1fr)_auto] @4xl:items-start"
                  type="button"
                  onClick={() => setExpandedPullRequest(expanded ? null : pullRequest.number)}
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <GitPullRequest className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span
                        className="line-clamp-3 text-sm font-medium leading-5 text-foreground [overflow-wrap:anywhere]"
                        data-pull-request-title
                      >
                        {pullRequest.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {pullRequest.author} ·{" "}
                        <span className="font-mono [overflow-wrap:anywhere]">
                          {pullRequest.branch}
                        </span>{" "}
                        · {pullRequest.updatedAt} · {pullRequest.checksLabel} ·{" "}
                        {pullRequest.rootSummary}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-3 pl-7 @4xl:justify-end @4xl:pl-0">
                    <span className={stateStyle.status}>
                      <span className={stateStyle.dot} />
                      {pullRequest.stateLabel}
                    </span>
                    <ChevronDown
                      className={
                        expanded
                          ? "h-4 w-4 rotate-180 text-muted-foreground"
                          : "h-4 w-4 text-muted-foreground"
                      }
                    />
                  </span>
                </button>
                <a
                  aria-label={`Open pull request #${pullRequest.number} on GitHub`}
                  className="mt-2 inline-flex min-h-8 items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground no-underline hover:bg-muted hover:text-foreground hover:no-underline"
                  href={`${repositoryUrl}/pull/${pullRequest.number}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span>#{pullRequest.number}</span>
                  <span
                    aria-hidden="true"
                    className="flex h-4 w-4 items-center justify-center text-foreground"
                  >
                    <GitHubProviderLogo />
                  </span>
                </a>
              </div>
              {expanded ? (
                <div className="pb-4 pl-7">
                  <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <VaultChecksPopover
                      checks={pullRequest.checks.checks}
                      detailsUrl={`${repositoryUrl}/pull/${pullRequest.number}/checks`}
                      heading={`Pull request #${pullRequest.number} checks`}
                      statusCheckRollup={pullRequest.checks.statusCheckRollup}
                      triggerTitle={`Show pull request #${pullRequest.number} checks`}
                    />
                    {pullRequest.details ? (
                      <>
                        <span>
                          into{" "}
                          <span className="font-mono text-foreground">
                            {pullRequest.details.baseBranch}
                          </span>
                        </span>
                        <span className="font-mono tabular-nums">
                          {pullRequest.details.changeSummary}
                        </span>
                        {pullRequest.details.labels.map((label) => (
                          <span key={label} className="bg-muted px-1.5 py-0.5 text-foreground">
                            {label}
                          </span>
                        ))}
                        <a
                          className="inline-flex min-h-8 items-center gap-1 font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                          href={pullRequest.details.changesUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          View changes
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </>
                    ) : null}
                  </div>
                  <RootRail roots={pullRequest.roots} separateRoots showLiveStatus />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SettingsResourceRow({ resource }: { resource: LabResource }) {
  const needsAttention = resource.state === "attention";

  return (
    <div
      className={
        needsAttention
          ? "grid min-w-0 gap-3 py-2.5 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-center"
          : "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5"
      }
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          aria-label={resource.kind === "cloudflare" ? "Cloudflare" : "Convex"}
          className="mt-0.5 flex h-4 w-5 shrink-0 items-center justify-center"
          role="img"
        >
          <ResourceIcon kind={resource.kind} />
        </span>
        <div className="min-w-0">
          <div className="line-clamp-2 text-xs leading-4 text-muted-foreground">
            {resourceOwner(resource)}/
          </div>
          <a
            className="line-clamp-2 min-w-0 text-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            href={resourceDashboardUrl(resource)}
            rel="noreferrer"
            target="_blank"
          >
            {resource.label}
          </a>
          <ResourceDestinationLinks resource={resource} />
          {needsAttention ? (
            <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {resource.stateLabel}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1 justify-self-start @3xl:justify-self-end">
        {needsAttention ? (
          <Button className="shadow-none" size="sm" type="button" variant="outline">
            {resource.kind === "cloudflare" ? "Configure Builds" : "Change code location"}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild nativeButton>
            <Button
              aria-label={`Actions for ${resource.label}`}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 rounded-none shadow-none">
            <DropdownMenuItem variant="destructive">Remove from vault</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function SettingsAttentionRow({ issue }: { issue: LabSettingsIssue }) {
  return (
    <div
      className="grid min-w-0 border-b border-border/60 last:border-b-0 @4xl:grid-cols-[minmax(10rem,0.32fr)_minmax(0,1fr)]"
      data-settings-issue={issue.resource.label}
    >
      <div className="min-w-0 pt-4 pb-1 @4xl:py-3 @4xl:pr-5">
        <RootDirectoryLabel needsAttention rootDirectory={issue.rootDirectory} />
      </div>
      <div className="min-w-0 pb-3 pl-5 @4xl:border-l @4xl:py-3 @4xl:pl-5">
        <div className="grid min-w-0 gap-3 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-center">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              aria-label={issue.resource.kind === "cloudflare" ? "Cloudflare" : "Convex"}
              className="mt-0.5 flex h-4 w-5 shrink-0 items-center justify-center"
              role="img"
            >
              <ResourceIcon kind={issue.resource.kind} />
            </span>
            <div className="min-w-0">
              <div className="line-clamp-2 text-xs leading-4 text-muted-foreground">
                {resourceOwner(issue.resource)}/
              </div>
              <a
                className="line-clamp-2 text-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                href={resourceDashboardUrl(issue.resource)}
                rel="noreferrer"
                target="_blank"
              >
                {issue.resource.label}
              </a>
              <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {issue.resource.stateLabel}
              </div>
              <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                {issue.detail}
              </p>
            </div>
          </div>
          <Button
            className="justify-self-start shadow-none @3xl:justify-self-end"
            size="sm"
            type="button"
            variant="outline"
          >
            {issue.actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SettingsRootGroup({ group }: { group: LabRootGroup }) {
  const needsAttention = group.rootDirectory === "Needs attention";

  return (
    <div
      className="grid min-w-0 border-b border-border/60 last:border-b-0 @4xl:grid-cols-[minmax(10rem,0.32fr)_minmax(0,1fr)]"
      data-settings-root={group.rootDirectory}
    >
      <div className="min-w-0 pt-4 pb-1 @4xl:py-3 @4xl:pr-5">
        <RootDirectoryLabel needsAttention={needsAttention} rootDirectory={group.rootDirectory} />
      </div>
      <div className="min-w-0 pb-2 pl-5 @4xl:border-l @4xl:pb-0 @4xl:pl-5">
        {group.resources.map((resource) => (
          <SettingsResourceRow key={`${resource.kind}-${resource.label}`} resource={resource} />
        ))}
      </div>
    </div>
  );
}

function RepositorySettings({ scenario }: { scenario: LabScenario }) {
  const issueResourceKeys = new Set(
    scenario.settingsIssues.map((issue) => `${issue.resource.kind}:${issue.resource.label}`),
  );

  return (
    <div className="min-h-full bg-background text-foreground">
      <RepositoryHeader page="settings" scenario={scenario} />
      <main className="mx-auto grid w-full max-w-[960px] gap-8 px-4 py-6 @3xl:px-6 @5xl:px-8 @5xl:py-8">
        {scenario.settingsIssues.length > 0 ? (
          <section aria-labelledby="vault-settings-attention-heading">
            <h2
              id="vault-settings-attention-heading"
              className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-red-700"
            >
              Attention required
            </h2>
            <div className="border-y border-border">
              {scenario.settingsIssues.map((issue) => (
                <SettingsAttentionRow
                  key={`${issue.rootDirectory}:${issue.resource.kind}:${issue.resource.label}`}
                  issue={issue}
                />
              ))}
            </div>
          </section>
        ) : null}
        <section aria-labelledby="vault-settings-connections-heading">
          <div className="mb-3 grid gap-3 @4xl:grid-cols-[minmax(0,1fr)_auto] @4xl:items-end">
            <h2
              id="vault-settings-connections-heading"
              className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
            >
              Connections
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button className="shadow-none" size="sm" type="button" variant="outline">
                <CloudflareProviderLogo />
                Add Cloudflare Worker
              </Button>
              <Button className="shadow-none" size="sm" type="button" variant="outline">
                <ConvexProviderLogo />
                Add Convex project
              </Button>
            </div>
          </div>
          <div className="border-y border-border">
            {scenario.productionRoots.map((root) => {
              const resources = root.resources.filter(
                (resource) => !issueResourceKeys.has(`${resource.kind}:${resource.label}`),
              );

              return resources.length > 0 ? (
                <SettingsRootGroup
                  key={root.rootDirectory}
                  group={{ rootDirectory: root.rootDirectory, resources }}
                />
              ) : null;
            })}
          </div>
        </section>

        <section aria-labelledby="vault-settings-remove-heading">
          <h2
            id="vault-settings-remove-heading"
            className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            Remove vault
          </h2>
          <div className="grid gap-3 border-y border-border py-4 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-center">
            <p className="max-w-xl text-xs leading-5 text-muted-foreground">
              Review repository and provider cleanup before anything is removed.
            </p>
            <Button
              className="justify-self-start @3xl:justify-self-end"
              size="sm"
              type="button"
              variant="destructive"
            >
              Remove vault
            </Button>
          </div>
        </section>
        <div aria-hidden="true" className="h-[20svh] min-h-20" />
      </main>
    </div>
  );
}

function VaultOverview({ scenario }: { scenario: LabScenario }) {
  return (
    <div className="min-h-full bg-background text-foreground">
      <RepositoryHeader page="overview" scenario={scenario} />
      <main className="mx-auto grid w-full max-w-[1100px] gap-8 px-4 py-6 @3xl:px-6 @5xl:px-8 @5xl:py-8">
        {scenario.alert ? <AttentionNotice alert={scenario.alert} /> : null}
        <DefaultBranchSection scenario={scenario} />
        <PullRequestSection
          defaultExpandedPullRequest={scenario.defaultExpandedPullRequest}
          pullRequests={scenario.pullRequests}
          repositoryUrl={scenario.repositoryUrl}
        />
        <div aria-hidden="true" className="h-[20svh] min-h-20" />
      </main>
    </div>
  );
}

/**
 * Disposable product-direction lab. It deliberately shares the Workspace V2 shell,
 * but not the current vault dashboard content, so the chosen direction can replace it cleanly.
 */
export function VaultOverviewDesignLabVisualFixture({
  mode,
  page = "overview",
}: {
  mode: VaultOverviewDesignLabVisualMode;
  page?: VaultOverviewDesignLabPage;
}) {
  const scenario = SCENARIOS[mode];

  return (
    <WorkspaceLayoutV2FixtureFrame
      dataTestId="vault-overview-design-lab"
      left={{
        header: (
          <div className="flex h-full items-center px-3 text-xs font-medium text-foreground">
            Vaults
          </div>
        ),
        content: <VaultSidebar mode={mode} page={page} />,
      }}
      main={{
        content:
          page === "settings" ? (
            <RepositorySettings scenario={scenario} />
          ) : (
            <VaultOverview scenario={scenario} />
          ),
        headerAccessory: <LabHeader mode={mode} page={page} scenario={scenario} />,
      }}
      shortcutPaneSide="left"
    />
  );
}
