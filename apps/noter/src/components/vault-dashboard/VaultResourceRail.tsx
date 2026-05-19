import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  Link2,
  Loader2,
  Plus,
  RotateCw,
  XCircle,
  type LucideIcon,
} from "lucide-react";

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
  action_required: "h-4 w-4 text-muted-foreground",
  failed: "h-4 w-4 text-destructive",
  pending: "h-4 w-4 text-muted-foreground",
  ready: "h-4 w-4 text-emerald-600",
  running: "h-4 w-4 animate-spin text-muted-foreground",
} satisfies Record<VaultResourceRailVisualStatus, string>;

const STATUS_TEXT_CLASS_NAMES = {
  failed: "col-span-2 -mt-1 min-h-4 text-xs leading-4 text-destructive",
  running: "col-span-2 -mt-1 min-h-4 text-xs leading-4 text-muted-foreground",
} satisfies Record<"failed" | "running", string>;
const EMPTY_STATUS_TEXT_CLASS_NAME =
  "col-span-2 -mt-1 min-h-4 text-xs leading-4";

function getStatusIcon(status: VaultResourceRailVisualStatus): LucideIcon {
  switch (status) {
    case "action_required":
      return Circle;
    case "failed":
      return XCircle;
    case "pending":
      return Circle;
    case "ready":
      return CheckCircle2;
    case "running":
      return Loader2;
  }
  status satisfies never;
  return Circle;
}

function getRowStatusText(row: VaultResourceRailRowState):
  | {
      className: string;
      text: string;
    }
  | undefined {
  switch (row.status) {
    case "failed":
      return {
        className: STATUS_TEXT_CLASS_NAMES.failed,
        text: row.statusText,
      };
    case "running":
      return {
        className: STATUS_TEXT_CLASS_NAMES.running,
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

function VaultResourceRailRow({ row }: { row: VaultResourceRailRowState }) {
  const StatusIcon = getStatusIcon(row.status);
  const actions = getRowActions(row);
  const statusText = getRowStatusText(row);
  const value =
    row.status === "action_required" ? null : row.status === "ready" &&
      row.href ? (
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
      data-provider={row.provider}
      className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2"
    >
      <div className="flex h-7 items-center justify-center">
        <StatusIcon className={STATUS_ICON_CLASS_NAMES[row.status]} />
      </div>
      <div className="flex min-h-7 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <div className="w-20 shrink-0 text-sm font-medium">
          {PROVIDER_LABELS[row.provider]}
        </div>
        {value ? (
          <div className="min-w-0 w-fit max-w-full shrink">
            <div className="truncate text-sm">{value}</div>
          </div>
        ) : null}
        {actions ? <VaultResourceRailActions actions={actions} /> : null}
      </div>
      {statusText ? (
        <div className={statusText.className}>{statusText.text}</div>
      ) : (
        <div aria-hidden="true" className={EMPTY_STATUS_TEXT_CLASS_NAME} />
      )}
    </div>
  );
}

export function VaultResourceRail({
  state,
}: {
  state: VaultResourceRailState;
}) {
  return (
    <div data-testid="vault-resource-rail" className="mt-2 grid w-full gap-1">
      {state.rows.map((row) => (
        <VaultResourceRailRow key={row.provider} row={row} />
      ))}
    </div>
  );
}
