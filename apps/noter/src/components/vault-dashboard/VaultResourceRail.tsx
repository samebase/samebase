import { Button } from "@/components/ui/button";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import {
  Clock,
  Link2,
  Loader2,
  Plus,
  RotateCw,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { type ComponentType } from "react";

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

export type VaultResourceRailProvider = "cloudflare" | "convex" | "github";

type VaultResourceRailPendingRow<TProvider extends VaultResourceRailProvider> =
  {
    provider: TProvider;
    scope?: string;
    status: "pending";
    value: string;
  };

type VaultResourceRailRunningRow<TProvider extends VaultResourceRailProvider> =
  {
    provider: TProvider;
    scope?: string;
    status: "running";
    value: string;
  };

type VaultResourceRailReadyRow<TProvider extends VaultResourceRailProvider> = {
  href?: string;
  provider: TProvider;
  scope?: string;
  status: "ready";
  value: string;
};

type VaultResourceRailActionRequiredRow<
  TProvider extends VaultResourceRailProvider,
> = {
  actions: VaultResourceRailActionList;
  provider: TProvider;
  status: "action_required";
};

type VaultResourceRailFailedRow<TProvider extends VaultResourceRailProvider> = {
  actions: VaultResourceRailActionList;
  provider: TProvider;
  scope?: string;
  status: "failed";
  value: string;
};

export type VaultResourceRailRowState<
  TProvider extends VaultResourceRailProvider = VaultResourceRailProvider,
> =
  | VaultResourceRailActionRequiredRow<TProvider>
  | VaultResourceRailFailedRow<TProvider>
  | VaultResourceRailPendingRow<TProvider>
  | VaultResourceRailReadyRow<TProvider>
  | VaultResourceRailRunningRow<TProvider>;

export type VaultResourceRailState = {
  rows: readonly [
    VaultResourceRailRowState<"github">,
    VaultResourceRailRowState<"convex">,
    VaultResourceRailRowState<"cloudflare">,
  ];
};

type VaultResourceRailIconStatus = "failed" | "pending" | "running";

const PROVIDER_LABELS = {
  cloudflare: "Cloudflare",
  convex: "Convex",
  github: "GitHub",
} satisfies Record<VaultResourceRailProvider, string>;

const PROVIDER_LOGOS = {
  cloudflare: CloudflareProviderLogo,
  convex: ConvexProviderLogo,
  github: GitHubProviderLogo,
} satisfies Record<VaultResourceRailProvider, ComponentType>;

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
  failed: "h-3.5 w-3.5 text-destructive",
  pending: "h-3.5 w-3.5 text-muted-foreground",
  running: "h-3.5 w-3.5 animate-spin text-muted-foreground",
} satisfies Record<VaultResourceRailIconStatus, string>;

const RESOURCE_LINK_ROW_CLASS_NAME =
  "group -mx-1.5 -my-1 grid min-h-8 max-w-full grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2 px-1.5 py-1 text-sm leading-6 text-foreground no-underline touch-manipulation";
const RESOURCE_ROW_CLASS_NAME =
  "grid min-h-8 max-w-full grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2 text-sm leading-6 text-foreground";
const RESOURCE_LOGO_SLOT_CLASS_NAME =
  "flex h-5 w-5 shrink-0 items-center justify-center";
const RESOURCE_CONTENT_CLASS_NAME =
  "flex min-w-0 flex-wrap items-center gap-1.5";
const RESOURCE_VALUE_CLASS_NAME = "min-w-0 max-w-64 truncate";
const RESOURCE_LINK_VALUE_CLASS_NAME =
  "min-w-0 max-w-64 truncate underline decoration-muted-foreground/40 underline-offset-4 group-hover:decoration-current";
const RESOURCE_VALUE_SCOPE_CLASS_NAME = "font-normal text-muted-foreground";

function getStatusIcon(status: VaultResourceRailIconStatus): LucideIcon {
  switch (status) {
    case "failed":
      return XCircle;
    case "pending":
      return Clock;
    case "running":
      return Loader2;
  }
  status satisfies never;
  return Clock;
}

function getRowActions(
  row: VaultResourceRailRowState,
): VaultResourceRailActionList | undefined {
  switch (row.status) {
    case "action_required":
    case "failed":
      return row.actions;
    case "pending":
    case "ready":
    case "running":
      return undefined;
  }
  row satisfies never;
  return undefined;
}

function getRowIconStatus(
  row: VaultResourceRailRowState,
): VaultResourceRailIconStatus | undefined {
  switch (row.status) {
    case "failed":
    case "pending":
    case "running":
      return row.status;
    case "action_required":
    case "ready":
      return undefined;
  }
  row satisfies never;
  return undefined;
}

function VaultResourceRailActions({
  actions,
  provider,
}: {
  actions: VaultResourceRailActionList;
  provider: VaultResourceRailProvider;
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
            aria-label={`${action.label} ${PROVIDER_LABELS[provider]}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}

function getRowValue(row: VaultResourceRailRowState): string | undefined {
  switch (row.status) {
    case "action_required":
      return undefined;
    case "failed":
    case "pending":
    case "ready":
    case "running":
      return row.value;
  }
  row satisfies never;
  return undefined;
}

function getRowScope(row: VaultResourceRailRowState): string | undefined {
  switch (row.status) {
    case "action_required":
      return undefined;
    case "failed":
    case "pending":
    case "ready":
    case "running":
      return row.scope;
  }
  row satisfies never;
  return undefined;
}

function formatResourceRailValue({
  scope,
  value,
}: {
  scope: string | undefined;
  value: string;
}) {
  return scope ? `${scope}/${value}` : value;
}

function VaultResourceRailValue({
  className,
  scope,
  value,
}: {
  className: string;
  scope: string | undefined;
  value: string;
}) {
  return (
    <span className={className}>
      {scope ? (
        <span className={RESOURCE_VALUE_SCOPE_CLASS_NAME}>{scope}/</span>
      ) : null}
      {value}
    </span>
  );
}

function VaultResourceRailStatusIcon({
  status,
}: {
  status: VaultResourceRailIconStatus;
}) {
  const StatusIcon = getStatusIcon(status);

  return <StatusIcon className={STATUS_ICON_CLASS_NAMES[status]} />;
}

function VaultResourceRailItem({ row }: { row: VaultResourceRailRowState }) {
  const ProviderLogo = PROVIDER_LOGOS[row.provider];
  const actions = getRowActions(row);
  const iconStatus = getRowIconStatus(row);
  const value = getRowValue(row);
  const scope = getRowScope(row);
  const providerLabel = PROVIDER_LABELS[row.provider];
  const displayValue = value
    ? formatResourceRailValue({ scope, value })
    : undefined;
  const content = (
    <div className={RESOURCE_CONTENT_CLASS_NAME}>
      {iconStatus ? <VaultResourceRailStatusIcon status={iconStatus} /> : null}
      {value ? (
        <VaultResourceRailValue
          className={RESOURCE_VALUE_CLASS_NAME}
          scope={scope}
          value={value}
        />
      ) : null}
      {actions ? (
        <VaultResourceRailActions actions={actions} provider={row.provider} />
      ) : null}
    </div>
  );

  if (row.status === "ready" && row.href) {
    return (
      <a
        data-provider={row.provider}
        href={row.href}
        target="_blank"
        rel="noopener noreferrer"
        className={RESOURCE_LINK_ROW_CLASS_NAME}
        title={`Open ${providerLabel}`}
        aria-label={`Open ${providerLabel}: ${displayValue ?? row.value}`}
      >
        <span className={RESOURCE_LOGO_SLOT_CLASS_NAME}>
          <ProviderLogo />
        </span>
        <VaultResourceRailValue
          className={RESOURCE_LINK_VALUE_CLASS_NAME}
          scope={scope}
          value={row.value}
        />
      </a>
    );
  }

  return (
    <div
      data-provider={row.provider}
      className={RESOURCE_ROW_CLASS_NAME}
      title={providerLabel}
    >
      <span className={RESOURCE_LOGO_SLOT_CLASS_NAME}>
        <ProviderLogo />
      </span>
      {content}
    </div>
  );
}

export function VaultResourceRail({
  state,
}: {
  state: VaultResourceRailState;
}) {
  return (
    <div data-testid="vault-resource-rail" className="mt-1 grid w-full gap-1">
      <div className="grid min-w-0 gap-0.5">
        {state.rows.map((row) => (
          <VaultResourceRailItem key={row.provider} row={row} />
        ))}
      </div>
    </div>
  );
}
