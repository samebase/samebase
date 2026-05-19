import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  CircleSlash2,
  Link2,
  Loader2,
  Plus,
  RotateCw,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type VaultResourceRailOrigin = "created_by_noter" | "connected_existing";

type VaultResourceRailActionKind = "connect_existing" | "create_new" | "retry";

export type VaultResourceRailAction = {
  disabled?: boolean;
  kind: VaultResourceRailActionKind;
  label: string;
  onClick?: () => void;
};

type VaultResourceRailActionList = readonly [
  VaultResourceRailAction,
  ...VaultResourceRailAction[],
];

export type VaultResourceRailGitHubState =
  | {
      state: "provisioning";
      repositoryFullName: string;
      detail: string;
    }
  | {
      state: "connected";
      origin: VaultResourceRailOrigin;
      repositoryFullName: string;
      href: string;
      detail?: string;
    }
  | {
      state: "failed";
      repositoryFullName: string;
      message: string;
      actions: VaultResourceRailActionList;
    };

export type VaultResourceRailProviderState =
  | {
      state: "not_configured";
      actions: VaultResourceRailActionList;
    }
  | {
      state: "selected";
      origin: VaultResourceRailOrigin;
      resourceName: string;
      detail: string;
    }
  | {
      state: "provisioning";
      origin: VaultResourceRailOrigin;
      resourceName: string;
      detail: string;
    }
  | {
      state: "connected";
      origin: VaultResourceRailOrigin;
      resourceName: string;
      href?: string;
      detail?: string;
    }
  | {
      state: "failed";
      resourceName: string;
      message: string;
      actions: VaultResourceRailActionList;
    }
  | {
      state: "skipped";
      detail: string;
    };

export type VaultResourceRailState = {
  github: VaultResourceRailGitHubState;
  convex: VaultResourceRailProviderState;
  cloudflare: VaultResourceRailProviderState;
};

type VaultResourceRailVisualStatus =
  | "connected"
  | "failed"
  | "not_configured"
  | "provisioning"
  | "selected"
  | "skipped";

type VaultResourceRailRowViewModel = {
  actions?: VaultResourceRailActionList;
  detail?: string;
  href?: string;
  label: string;
  providerLabel: "GitHub" | "Convex" | "Cloudflare";
  status: VaultResourceRailVisualStatus;
  value: string;
};

const ACTION_ICONS = {
  connect_existing: Link2,
  create_new: Plus,
  retry: RotateCw,
} satisfies Record<VaultResourceRailActionKind, LucideIcon>;

const ACTION_VARIANTS = {
  connect_existing: "outline",
  create_new: "outline",
  retry: "outline",
} as const satisfies Record<VaultResourceRailActionKind, "default" | "outline">;

const STATUS_ICON_CLASS_NAMES = {
  connected: "h-4 w-4 text-emerald-600",
  failed: "h-4 w-4 text-destructive",
  not_configured: "h-4 w-4 text-muted-foreground",
  provisioning: "h-4 w-4 animate-spin text-muted-foreground",
  selected: "h-4 w-4 text-muted-foreground",
  skipped: "h-4 w-4 text-muted-foreground",
} satisfies Record<VaultResourceRailVisualStatus, string>;

function formatOrigin(origin: VaultResourceRailOrigin): string {
  switch (origin) {
    case "created_by_noter":
      return "Noter-created";
    case "connected_existing":
      return "Connected existing";
  }
  origin satisfies never;
  return "Connected";
}

function mapGitHubRow(
  github: VaultResourceRailGitHubState,
): VaultResourceRailRowViewModel {
  switch (github.state) {
    case "provisioning":
      return {
        providerLabel: "GitHub",
        label: "GitHub",
        status: "provisioning",
        value: github.repositoryFullName,
        detail: github.detail,
      };
    case "connected":
      return {
        providerLabel: "GitHub",
        label: "GitHub",
        status: "connected",
        value: github.repositoryFullName,
        href: github.href,
        detail: github.detail ?? formatOrigin(github.origin),
      };
    case "failed":
      return {
        providerLabel: "GitHub",
        label: "GitHub",
        status: "failed",
        value: github.repositoryFullName,
        detail: github.message,
        actions: github.actions,
      };
  }
  github satisfies never;
  return {
    providerLabel: "GitHub",
    label: "GitHub",
    status: "failed",
    value: "GitHub",
    detail: "Unknown GitHub state.",
  };
}

function mapProviderRow({
  providerLabel,
  provider,
}: {
  providerLabel: "Convex" | "Cloudflare";
  provider: VaultResourceRailProviderState;
}): VaultResourceRailRowViewModel {
  switch (provider.state) {
    case "not_configured":
      return {
        providerLabel,
        label: providerLabel,
        status: "not_configured",
        value: "Not connected",
        actions: provider.actions,
      };
    case "selected":
      return {
        providerLabel,
        label: providerLabel,
        status: "selected",
        value: provider.resourceName,
        detail: provider.detail,
      };
    case "provisioning":
      return {
        providerLabel,
        label: providerLabel,
        status: "provisioning",
        value: provider.resourceName,
        detail: provider.detail,
      };
    case "connected":
      return {
        providerLabel,
        label: providerLabel,
        status: "connected",
        value: provider.resourceName,
        href: provider.href,
        detail: provider.detail ?? formatOrigin(provider.origin),
      };
    case "failed":
      return {
        providerLabel,
        label: providerLabel,
        status: "failed",
        value: provider.resourceName,
        detail: provider.message,
        actions: provider.actions,
      };
    case "skipped":
      return {
        providerLabel,
        label: providerLabel,
        status: "skipped",
        value: "Skipped",
        detail: provider.detail,
      };
  }
  provider satisfies never;
  return {
    providerLabel,
    label: providerLabel,
    status: "failed",
    value: providerLabel,
    detail: "Unknown resource state.",
  };
}

function getStatusIcon(status: VaultResourceRailVisualStatus): LucideIcon {
  switch (status) {
    case "connected":
      return CheckCircle2;
    case "failed":
      return XCircle;
    case "not_configured":
      return Plus;
    case "provisioning":
      return Loader2;
    case "selected":
      return Circle;
    case "skipped":
      return CircleSlash2;
  }
  status satisfies never;
  return Circle;
}

function VaultResourceRailActions({
  actions,
}: {
  actions: VaultResourceRailActionList;
}) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {actions.map((action) => {
        const Icon = ACTION_ICONS[action.kind];
        return (
          <Button
            key={`${action.kind}:${action.label}`}
            type="button"
            variant={ACTION_VARIANTS[action.kind]}
            size="sm"
            className="h-7 gap-1 px-2"
            onClick={action.onClick}
            disabled={action.disabled}
          >
            <Icon className="h-3.5 w-3.5" />
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}

function VaultResourceRailRow({ row }: { row: VaultResourceRailRowViewModel }) {
  const StatusIcon = getStatusIcon(row.status);
  const value = row.href ? (
    <a
      href={row.href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-current"
    >
      {row.value}
    </a>
  ) : (
    row.value
  );

  return (
    <div
      data-provider={row.providerLabel.toLowerCase()}
      className="grid min-h-8 grid-cols-[1rem_minmax(0,1fr)] gap-x-2"
    >
      <div className="flex h-8 items-center justify-center">
        <StatusIcon className={STATUS_ICON_CLASS_NAMES[row.status]} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <div className="w-20 shrink-0 text-sm font-medium">{row.label}</div>
        <div className="min-w-0 w-fit max-w-full shrink">
          <div className="truncate text-sm">{value}</div>
          {row.detail ? (
            <div className="truncate text-xs text-muted-foreground">
              {row.detail}
            </div>
          ) : null}
        </div>
        {row.actions ? (
          <VaultResourceRailActions actions={row.actions} />
        ) : null}
      </div>
    </div>
  );
}

export function VaultResourceRail({
  state,
}: {
  state: VaultResourceRailState;
}) {
  const rows = [
    mapGitHubRow(state.github),
    mapProviderRow({ providerLabel: "Convex", provider: state.convex }),
    mapProviderRow({
      providerLabel: "Cloudflare",
      provider: state.cloudflare,
    }),
  ] satisfies readonly VaultResourceRailRowViewModel[];

  return (
    <div data-testid="vault-resource-rail" className="mt-2 grid w-full gap-1">
      {rows.map((row) => (
        <VaultResourceRailRow key={row.providerLabel} row={row} />
      ))}
    </div>
  );
}
