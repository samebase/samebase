import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleDot,
  ExternalLink,
  GitBranch,
  GitPullRequest,
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

export type VaultOverviewDesignLabVisualMode =
  | "vault-overview-lab-simple"
  | "vault-overview-lab-monorepo"
  | "vault-overview-lab-stress"
  | "vault-overview-lab-attention";

export type VaultOverviewDesignLabPage = "overview" | "settings";

type ResourceKind = "cloudflare" | "convex";
type ResourceState = "attention" | "building" | "live" | "ready" | "reused" | "unavailable";
type EventState = "attention" | "building" | "live" | "ready";

type LabResource = {
  kind: ResourceKind;
  label: string;
  href: string | null;
  relationship: string | null;
  state: ResourceState;
  stateLabel: string;
};

type LabRootGroup = {
  rootDirectory: string;
  resources: readonly LabResource[];
};

type LabPullRequest = {
  author: string;
  checksLabel: string;
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

type LabScenario = {
  alert: LabAlert | null;
  commit: {
    author: string;
    checksLabel: string;
    hash: string;
    state: EventState;
    title: string;
    updatedAt: string;
  };
  defaultExpandedPullRequest: number | null;
  label: string;
  productionRoots: readonly LabRootGroup[];
  productionVisibleRootCount: number;
  pullRequests: readonly LabPullRequest[];
  repositoryName: string;
  repositoryOwner: string;
  repositoryUrl: string;
};

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

const MONOREPO_PRODUCTION_ROOTS = [
  {
    rootDirectory: "apps/domain-router",
    resources: [
      {
        kind: "cloudflare",
        label: "domain-router",
        href: "https://domain-router.samebase.workers.dev",
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
        label: "posthog-proxy",
        href: null,
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
        label: "samebase-worker",
        href: "https://samebase.com",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
      {
        kind: "convex",
        label: "samebase",
        href: null,
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
] satisfies readonly LabRootGroup[];

const MONOREPO_PULL_REQUESTS = [
  {
    author: "nicu",
    checksLabel: "14/14 checks",
    number: 1263,
    rootSummary: "1 app observed",
    roots: [
      {
        rootDirectory: "apps/samebase",
        resources: [
          {
            kind: "cloudflare",
            label: "samebase-worker",
            href: "https://1263.samebase.workers.dev",
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
    checksLabel: "9/14 checks",
    number: 1262,
    rootSummary: "2 apps observed",
    roots: [
      {
        rootDirectory: "apps/domain-router",
        resources: [
          {
            kind: "cloudflare",
            label: "domain-router",
            href: "https://1262.domain-router.workers.dev",
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
            label: "samebase-worker",
            href: null,
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
    checksLabel: "14/14 checks",
    number: 1259,
    rootSummary: "1 app observed",
    roots: [
      {
        rootDirectory: "apps/samebase",
        resources: [
          {
            kind: "cloudflare",
            label: "samebase-worker",
            href: "https://samebase.com",
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
        label: "commerce-edge",
        href: null,
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
        label: "accounts",
        href: null,
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
  {
    rootDirectory: "apps/admin",
    resources: [
      {
        kind: "cloudflare",
        label: "commerce-admin",
        href: "https://admin.commerce.example",
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
        label: "commerce-analytics",
        href: null,
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
        label: "catalog",
        href: null,
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
  {
    rootDirectory: "apps/checkout",
    resources: [
      {
        kind: "cloudflare",
        label: "commerce-checkout",
        href: "https://checkout.commerce.example",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
      {
        kind: "convex",
        label: "checkout",
        href: null,
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
  {
    rootDirectory: "apps/content",
    resources: [
      {
        kind: "cloudflare",
        label: "commerce-content",
        href: null,
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
        label: "notifications",
        href: null,
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
  {
    rootDirectory: "apps/search",
    resources: [
      {
        kind: "cloudflare",
        label: "commerce-search",
        href: null,
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
        label: "commerce-storefront",
        href: "https://commerce.example",
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
      {
        kind: "cloudflare",
        label: "commerce-images",
        href: null,
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
      {
        kind: "convex",
        label: "storefront",
        href: null,
        relationship: null,
        state: "live",
        stateLabel: "Live",
      },
    ],
  },
  {
    rootDirectory: "services/email",
    resources: [
      {
        kind: "cloudflare",
        label: "commerce-email",
        href: null,
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
        label: "commerce-webhooks",
        href: null,
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
    checksLabel: "21/24 checks",
    number: 842,
    rootSummary: "12 apps checked, 2 previews",
    roots: [
      {
        rootDirectory: "apps/checkout",
        resources: [
          {
            kind: "cloudflare",
            label: "commerce-checkout",
            href: "https://842.checkout.commerce.example",
            relationship: "Convex preview verified from this build",
            state: "ready",
            stateLabel: "Preview ready",
          },
        ],
      },
      {
        rootDirectory: "apps/storefront",
        resources: [
          {
            kind: "cloudflare",
            label: "commerce-storefront",
            href: "https://842.commerce.example",
            relationship: null,
            state: "ready",
            stateLabel: "Preview ready",
          },
          {
            kind: "cloudflare",
            label: "commerce-images",
            href: null,
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
    checksLabel: "24/24 checks",
    number: 841,
    rootSummary: "12 apps checked, 1 preview",
    roots: [
      {
        rootDirectory: "apps/search",
        resources: [
          {
            kind: "cloudflare",
            label: "commerce-search",
            href: "https://841.search.commerce.example",
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
    checksLabel: "24/24 checks",
    number: 839,
    rootSummary: "12 apps checked, no previews",
    roots: [
      {
        rootDirectory: "services/email",
        resources: [
          {
            kind: "cloudflare",
            label: "commerce-email",
            href: null,
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
    checksLabel: "18/24 checks",
    number: 837,
    rootSummary: "12 apps checked, 1 preview",
    roots: [
      {
        rootDirectory: "apps/admin",
        resources: [
          {
            kind: "cloudflare",
            label: "commerce-admin",
            href: null,
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
    checksLabel: "24/24 checks",
    number: 836,
    rootSummary: "12 apps checked, no previews",
    roots: [
      {
        rootDirectory: "apps/analytics",
        resources: [
          {
            kind: "cloudflare",
            label: "commerce-analytics",
            href: null,
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
    checksLabel: "24/24 checks",
    number: 832,
    rootSummary: "12 apps checked, 1 preview",
    roots: [
      {
        rootDirectory: "services/webhooks",
        resources: [
          {
            kind: "cloudflare",
            label: "commerce-webhooks",
            href: "https://832.webhooks.commerce.example",
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
      checksLabel: "6/6 checks",
      hash: "8f2ac16",
      state: "ready",
      title: "Polish the empty guestbook state",
      updatedAt: "11 min ago",
    },
    defaultExpandedPullRequest: 48,
    label: "Simple app",
    productionRoots: [
      {
        rootDirectory: "/",
        resources: [
          {
            kind: "cloudflare",
            label: "guestbook",
            href: "https://guestbook.samebase.app",
            relationship: null,
            state: "live",
            stateLabel: "Live",
          },
          {
            kind: "convex",
            label: "guestbook",
            href: null,
            relationship: null,
            state: "live",
            stateLabel: "Live",
          },
        ],
      },
    ],
    productionVisibleRootCount: 1,
    pullRequests: [
      {
        author: "noter-guest",
        checksLabel: "6/6 checks",
        number: 48,
        rootSummary: "Preview ready",
        roots: [
          {
            rootDirectory: "/",
            resources: [
              {
                kind: "cloudflare",
                label: "guestbook",
                href: "https://48.guestbook.samebase.app",
                relationship: "Convex preview verified from this build",
                state: "ready",
                stateLabel: "Preview ready",
              },
            ],
          },
        ],
        state: "ready",
        stateLabel: "Ready",
        title: "Make entries sortable",
        updatedAt: "34 min ago",
      },
    ],
    repositoryName: "guestbook",
    repositoryOwner: "noter-guest",
    repositoryUrl: "https://github.com/noter-guest/guestbook",
  },
  "vault-overview-lab-monorepo": {
    alert: null,
    commit: {
      author: "nicu",
      checksLabel: "14/14 checks",
      hash: "9111562",
      state: "ready",
      title: "Discover default-layout Convex projects",
      updatedAt: "23 min ago",
    },
    defaultExpandedPullRequest: 1263,
    label: "Monorepo",
    productionRoots: MONOREPO_PRODUCTION_ROOTS,
    productionVisibleRootCount: 3,
    pullRequests: MONOREPO_PULL_REQUESTS,
    repositoryName: "samebase",
    repositoryOwner: "samebase",
    repositoryUrl: "https://github.com/samebase/samebase",
  },
  "vault-overview-lab-stress": {
    alert: null,
    commit: {
      author: "maya",
      checksLabel: "24/24 checks",
      hash: "4ad90cb",
      state: "ready",
      title: "Keep fulfillment events ordered across regions",
      updatedAt: "7 min ago",
    },
    defaultExpandedPullRequest: 842,
    label: "Large monorepo",
    productionRoots: STRESS_PRODUCTION_ROOTS,
    productionVisibleRootCount: 5,
    pullRequests: STRESS_PULL_REQUESTS,
    repositoryName: "commerce-order-fulfillment-platform",
    repositoryOwner: "samebase",
    repositoryUrl: "https://github.com/samebase/commerce-order-fulfillment-platform",
  },
  "vault-overview-lab-attention": {
    alert: {
      detail: "The provider observation still exists, but its verified repository root is missing.",
      title: "plugin-preview-router needs a root before new previews can build",
    },
    commit: {
      author: "nicu",
      checksLabel: "13/14 checks",
      hash: "a12fbc8",
      state: "attention",
      title: "Keep plugin preview URLs stable across renames",
      updatedAt: "16 min ago",
    },
    defaultExpandedPullRequest: 217,
    label: "Needs attention",
    productionRoots: [
      {
        rootDirectory: "Needs attention",
        resources: [
          {
            kind: "cloudflare",
            label: "plugin-preview-router",
            href: null,
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
            label: "plugin-directory",
            href: "https://plugins.samebase.com",
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
            label: "plugin-registry",
            href: null,
            relationship: null,
            state: "live",
            stateLabel: "Live",
          },
        ],
      },
    ],
    productionVisibleRootCount: 3,
    pullRequests: [
      {
        author: "nicu",
        checksLabel: "11/14 checks",
        number: 217,
        rootSummary: "1 resource needs attention",
        roots: [
          {
            rootDirectory: "Needs attention",
            resources: [
              {
                kind: "cloudflare",
                label: "plugin-preview-router",
                href: null,
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
                label: "plugin-directory",
                href: "https://217.plugins.samebase.com",
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
        checksLabel: "8/8 checks",
        number: 214,
        rootSummary: "1 app observed",
        roots: [
          {
            rootDirectory: "packages/registry",
            resources: [
              {
                kind: "cloudflare",
                label: "plugin-registry-api",
                href: "https://214.registry.samebase.com",
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

function ResourceRow({ resource }: { resource: LabResource }) {
  const style = RESOURCE_STATE_STYLE[resource.state];
  const title = (
    <span className="min-w-0 truncate font-medium text-foreground">{resource.label}</span>
  );

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
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {resource.href ? (
              <a
                className="inline-flex min-w-0 items-center gap-1 underline decoration-border underline-offset-4 hover:decoration-foreground"
                href={resource.href}
                rel="noreferrer"
                target="_blank"
              >
                {title}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              title
            )}
          </div>
          {resource.relationship ? (
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              {resource.relationship}
            </div>
          ) : null}
        </div>
      </div>
      <div className={style.status}>
        {style.icon}
        {resource.stateLabel}
      </div>
    </div>
  );
}

function RootGroup({
  group,
  hideRootDirectory,
}: {
  group: LabRootGroup;
  hideRootDirectory: boolean;
}) {
  return (
    <div className="relative border-b border-border/50 last:border-b-0">
      <span
        aria-hidden="true"
        className="absolute -left-5 top-[1.35rem] w-4 border-t border-border"
      />
      {hideRootDirectory ? null : (
        <div
          className="pt-3 font-mono text-xs font-medium text-foreground"
          data-root-directory={group.rootDirectory}
        >
          {group.rootDirectory}
        </div>
      )}
      <div className={hideRootDirectory ? "py-0.5" : "pb-0.5"}>
        {group.resources.map((resource) => (
          <ResourceRow key={`${resource.kind}-${resource.label}`} resource={resource} />
        ))}
      </div>
    </div>
  );
}

function RootRail({ roots }: { roots: readonly LabRootGroup[] }) {
  const hideRootDirectory = roots.length === 1 && roots[0]?.rootDirectory === "/";

  return (
    <div className="ml-2.5 border-l border-border pl-5">
      {roots.map((root) => (
        <RootGroup key={root.rootDirectory} group={root} hideRootDirectory={hideRootDirectory} />
      ))}
    </div>
  );
}

function EventStatus({ label, state }: { label: string; state: EventState }) {
  const style = EVENT_STATE_STYLE[state];
  return (
    <span className={style.status}>
      <span className={style.dot} />
      {label}
    </span>
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
        const appCount = scenario.productionRoots.filter(
          (root) => root.rootDirectory !== "Needs attention",
        ).length;
        const pullRequestCount = scenario.pullRequests.length;
        const commitStateStyle = EVENT_STATE_STYLE[scenario.commit.state];
        const compactChecksLabel = scenario.commit.checksLabel.replace(" checks", "");
        return (
          <Link
            key={option.mode}
            aria-label={`${scenario.repositoryOwner}/${scenario.repositoryName}, main ${compactChecksLabel}, ${appCount} ${appCount === 1 ? "app" : "apps"}${pullRequestCount > 0 ? `, ${pullRequestCount} ${pullRequestCount === 1 ? "PR" : "PRs"}` : ""}`}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "mx-2 block min-w-0 bg-muted px-2 py-2.5 text-left @max-[200px]:mx-1 @max-[200px]:px-1 @max-[120px]:mx-0"
                : "mx-2 block min-w-0 px-2 py-2.5 text-left hover:bg-muted @max-[200px]:mx-1 @max-[200px]:px-1 @max-[120px]:mx-0"
            }
            search={(current) => ({
              ...current,
              mode: option.mode,
              view: page === "settings" ? "settings" : undefined,
            })}
            title={`${scenario.repositoryOwner}/${scenario.repositoryName}`}
            to="/visual-fixture"
          >
            <span className="flex min-w-0 items-baseline text-sm leading-5">
              <span
                className="mr-1 shrink-0 text-muted-foreground @max-[200px]:hidden"
                data-vault-sidebar-owner
              >
                {scenario.repositoryOwner} /
              </span>
              <span className="min-w-0 line-clamp-2 font-medium text-foreground [overflow-wrap:anywhere]">
                {scenario.repositoryName}
              </span>
            </span>
            <span className="mt-1 flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
              <span className="mt-1 flex shrink-0">
                <span className={commitStateStyle.dot} />
              </span>
              <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">
                <span className="@max-[120px]:hidden" data-vault-sidebar-branch>
                  main{" "}
                </span>
                <span data-vault-sidebar-checks>{compactChecksLabel}</span>
                <span className="@max-[200px]:hidden" data-vault-sidebar-totals>
                  {` · ${appCount} ${appCount === 1 ? "app" : "apps"}`}
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
        <div className="min-w-0 w-full @3xl:w-auto @3xl:flex-1">
          <div className="flex min-w-0 items-baseline gap-1 text-base">
            <span className="truncate text-muted-foreground">{scenario.repositoryOwner}</span>
            <span className="text-muted-foreground">/</span>
            <h1 className="truncate font-semibold text-foreground">{scenario.repositoryName}</h1>
          </div>
        </div>
        <div className="flex w-full items-center gap-3 text-xs @3xl:w-auto">
          <a
            className="inline-flex items-center gap-1 text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
            href={scenario.repositoryUrl}
            rel="noreferrer"
            target="_blank"
          >
            GitHub
            <ExternalLink className="h-3 w-3" />
          </a>
          <Link
            aria-current={page === "overview" ? "page" : undefined}
            className={
              page === "overview"
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }
            search={(current) => ({ ...current, view: undefined })}
            to="/visual-fixture"
          >
            Overview
          </Link>
          <Link
            aria-current={page === "settings" ? "page" : undefined}
            className={
              page === "settings"
                ? "inline-flex items-center gap-1 font-medium text-foreground"
                : "inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            }
            search={(current) => ({ ...current, view: "settings" })}
            to="/visual-fixture"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </Link>
        </div>
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
    <section aria-labelledby="vault-overview-default-branch-heading">
      <div className="mb-3">
        <h2
          id="vault-overview-default-branch-heading"
          className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          Default branch
        </h2>
      </div>

      <div className="border-y border-border py-4">
        <div className="grid gap-3 @4xl:grid-cols-[minmax(0,1fr)_auto] @4xl:items-start">
          <div className="flex min-w-0 items-start gap-3">
            <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold text-foreground">main</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {scenario.commit.hash}
                </span>
              </div>
              <div className="mt-1 text-sm leading-6 text-foreground">{scenario.commit.title}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                {scenario.commit.author} · {scenario.commit.updatedAt}
              </div>
            </div>
          </div>
          <EventStatus label={scenario.commit.checksLabel} state={scenario.commit.state} />
        </div>

        <div className="mt-3">
          <RootRail roots={visibleRoots} />
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
}: {
  defaultExpandedPullRequest: number | null;
  pullRequests: readonly LabPullRequest[];
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
              <button
                aria-expanded={expanded}
                className="grid w-full gap-3 px-0 py-4 text-left @4xl:grid-cols-[minmax(0,1fr)_auto] @4xl:items-start"
                type="button"
                onClick={() => setExpandedPullRequest(expanded ? null : pullRequest.number)}
              >
                <span className="flex min-w-0 items-start gap-3">
                  <GitPullRequest className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-sm font-medium leading-5 text-foreground">
                        {pullRequest.title}
                      </span>
                      <span className="text-xs text-muted-foreground">#{pullRequest.number}</span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {pullRequest.author} · {pullRequest.updatedAt} · {pullRequest.checksLabel} ·{" "}
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
              {expanded ? (
                <div className="pb-4 pl-7">
                  <RootRail roots={pullRequest.roots} />
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
    <div className="grid min-w-0 gap-3 border-b border-border/40 py-3 last:border-b-0 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-center">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          aria-label={resource.kind === "cloudflare" ? "Cloudflare" : "Convex"}
          className="mt-0.5 flex h-4 w-5 shrink-0 items-center justify-center"
          role="img"
        >
          <ResourceIcon kind={resource.kind} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{resource.label}</div>
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

function SettingsRootGroup({ group }: { group: LabRootGroup }) {
  const needsAttention = group.rootDirectory === "Needs attention";

  return (
    <div
      className="grid min-w-0 border-b border-border/60 last:border-b-0 @4xl:grid-cols-[minmax(10rem,0.32fr)_minmax(0,1fr)]"
      data-settings-root={group.rootDirectory}
    >
      <div
        className={
          needsAttention
            ? "min-w-0 py-3 font-mono text-xs font-medium text-red-700 @4xl:pr-5"
            : "min-w-0 py-3 font-mono text-xs font-medium text-foreground @4xl:pr-5"
        }
      >
        <span className="block [overflow-wrap:anywhere]">{group.rootDirectory}</span>
      </div>
      <div className="min-w-0 border-t border-border/40 @4xl:border-l @4xl:border-t-0 @4xl:pl-5">
        {group.resources.map((resource) => (
          <SettingsResourceRow key={`${resource.kind}-${resource.label}`} resource={resource} />
        ))}
      </div>
    </div>
  );
}

function RepositorySettings({ scenario }: { scenario: LabScenario }) {
  return (
    <div className="min-h-full bg-background text-foreground">
      <RepositoryHeader page="settings" scenario={scenario} />
      <main className="mx-auto grid w-full max-w-[960px] gap-8 px-4 py-6 @3xl:px-6 @5xl:px-8 @5xl:py-8">
        <section aria-labelledby="vault-settings-repository-heading">
          <h2
            id="vault-settings-repository-heading"
            className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            Repository
          </h2>
          <div className="grid gap-3 border-y border-border py-4 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-center">
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-label="GitHub"
                className="mt-0.5 flex h-4 w-5 shrink-0 items-center justify-center"
                role="img"
              >
                <GitHubProviderLogo />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {scenario.repositoryOwner}/{scenario.repositoryName}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Default branch <span className="font-mono text-foreground">main</span>
                </div>
              </div>
            </div>
            <a
              className="inline-flex items-center gap-1 justify-self-start text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground @3xl:justify-self-end"
              href={scenario.repositoryUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open on GitHub
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </section>

        <section aria-labelledby="vault-settings-connections-heading">
          <div className="mb-3 grid gap-3 @4xl:grid-cols-[minmax(0,1fr)_auto] @4xl:items-end">
            <div>
              <h2
                id="vault-settings-connections-heading"
                className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
              >
                Connections
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Resources are grouped by their repository root.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="shadow-none" size="sm" type="button" variant="outline">
                <CloudflareProviderLogo />
                Add Cloudflare
              </Button>
              <Button className="shadow-none" size="sm" type="button" variant="outline">
                <ConvexProviderLogo />
                Add Convex
              </Button>
            </div>
          </div>
          <div className="border-y border-border">
            {scenario.productionRoots.map((root) => (
              <SettingsRootGroup key={root.rootDirectory} group={root} />
            ))}
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
          <div className="flex h-full items-center justify-between px-3 text-xs font-medium text-foreground">
            <span>Vaults</span>
            <span className="tabular-nums text-muted-foreground">{LAB_MODES.length}</span>
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
