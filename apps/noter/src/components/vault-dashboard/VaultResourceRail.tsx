import { Button } from "@/components/ui/button";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import {
  Circle,
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
    status: "pending";
    value: string;
  };

type VaultResourceRailRunningRow<TProvider extends VaultResourceRailProvider> =
  {
    provider: TProvider;
    status: "running";
    statusText: string;
    value: string;
  };

type VaultResourceRailReadyRow<TProvider extends VaultResourceRailProvider> = {
  href?: string;
  provider: TProvider;
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
  status: "failed";
  statusText: string;
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

type VaultResourceRailVisualStatus = VaultResourceRailRowState["status"];

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
  action_required: "h-3.5 w-3.5 text-muted-foreground",
  failed: "h-3.5 w-3.5 text-destructive",
  pending: "h-3.5 w-3.5 text-muted-foreground",
  running: "h-3.5 w-3.5 animate-spin text-muted-foreground",
} satisfies Record<Exclude<VaultResourceRailVisualStatus, "ready">, string>;

const STATUS_MESSAGE_CLASS_NAMES = {
  failed: "min-w-0 text-xs leading-4 text-destructive",
  running: "min-w-0 text-xs leading-4 text-muted-foreground",
} satisfies Record<"failed" | "running", string>;
const RESOURCE_LINK_CLASS_NAME =
  "-mx-1.5 -my-1 inline-flex min-h-8 max-w-full items-center gap-1.5 px-1.5 py-1 text-sm leading-6 text-foreground underline decoration-muted-foreground/40 underline-offset-4 touch-manipulation hover:decoration-current";
const RESOURCE_ITEM_CLASS_NAME =
  "inline-flex min-h-8 max-w-full flex-wrap items-center gap-1.5 text-sm leading-6 text-foreground";
const RESOURCE_LOGO_SLOT_CLASS_NAME =
  "flex h-5 w-5 shrink-0 items-center justify-center";
const RESOURCE_VALUE_CLASS_NAME = "min-w-0 max-w-64 truncate";

function getStatusIcon(
  status: Exclude<VaultResourceRailVisualStatus, "ready">,
): LucideIcon {
  switch (status) {
    case "action_required":
      return Circle;
    case "failed":
      return XCircle;
    case "pending":
      return Circle;
    case "running":
      return Loader2;
  }
  status satisfies never;
  return Circle;
}

function getRowStatusMessage(row: VaultResourceRailRowState):
  | {
      provider: VaultResourceRailProvider;
      className: string;
      text: string;
    }
  | undefined {
  switch (row.status) {
    case "failed":
      return {
        provider: row.provider,
        className: STATUS_MESSAGE_CLASS_NAMES.failed,
        text: row.statusText,
      };
    case "running":
      return {
        provider: row.provider,
        className: STATUS_MESSAGE_CLASS_NAMES.running,
        text: row.statusText,
      };
    case "action_required":
    case "pending":
    case "ready":
      return undefined;
  }
  row satisfies never;
  return undefined;
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

function VaultResourceRailStatusIcon({
  status,
}: {
  status: Exclude<VaultResourceRailVisualStatus, "ready">;
}) {
  const StatusIcon = getStatusIcon(status);

  return <StatusIcon className={STATUS_ICON_CLASS_NAMES[status]} />;
}

function VaultResourceRailItem({ row }: { row: VaultResourceRailRowState }) {
  const ProviderLogo = PROVIDER_LOGOS[row.provider];
  const actions = getRowActions(row);
  const value = getRowValue(row);
  const providerLabel = PROVIDER_LABELS[row.provider];
  const content = (
    <>
      <span className={RESOURCE_LOGO_SLOT_CLASS_NAME}>
        <ProviderLogo />
      </span>
      {row.status === "ready" ? null : (
        <VaultResourceRailStatusIcon status={row.status} />
      )}
      {value ? (
        <span className={RESOURCE_VALUE_CLASS_NAME}>{value}</span>
      ) : null}
      {actions ? (
        <VaultResourceRailActions actions={actions} provider={row.provider} />
      ) : null}
    </>
  );

  if (row.status === "ready" && row.href) {
    return (
      <a
        href={row.href}
        target="_blank"
        rel="noopener noreferrer"
        className={RESOURCE_LINK_CLASS_NAME}
        title={`Open ${providerLabel}`}
        aria-label={`Open ${providerLabel}: ${row.value}`}
      >
        {content}
      </a>
    );
  }

  return (
    <div
      data-provider={row.provider}
      className={RESOURCE_ITEM_CLASS_NAME}
      title={providerLabel}
    >
      {content}
    </div>
  );
}

export function VaultResourceRail({
  state,
}: {
  state: VaultResourceRailState;
}) {
  const statusMessages = state.rows
    .map((row) => getRowStatusMessage(row))
    .filter((message) => message !== undefined);

  return (
    <div data-testid="vault-resource-rail" className="mt-1 grid w-full gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {state.rows.map((row) => (
          <VaultResourceRailItem key={row.provider} row={row} />
        ))}
      </div>
      {statusMessages.length > 0 ? (
        <div className="grid min-w-0 gap-0.5">
          {statusMessages.map((message) => (
            <div key={message.provider} className={message.className}>
              <span className="font-medium">
                {PROVIDER_LABELS[message.provider]}
              </span>
              {`: ${message.text}`}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
