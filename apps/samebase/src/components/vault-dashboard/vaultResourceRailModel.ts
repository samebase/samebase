type VaultResourceRailActionKind = "add" | "configure" | "connect" | "remove" | "retry";

export type VaultResourceRailAction = {
  ariaLabel?: string;
  disabled?: boolean;
  href?: string;
  kind: VaultResourceRailActionKind;
  label: string;
  onClick?: () => void;
};

export type VaultResourceRailActionList = readonly [
  VaultResourceRailAction,
  ...VaultResourceRailAction[],
];

export type VaultResourceRailProvider = "cloudflare" | "convex";

type VaultResourceRailLoadingRow<TProvider extends VaultResourceRailProvider> = {
  description?: string;
  provider: TProvider;
  rowId: string;
  scope?: string;
  status: "loading";
  value: string;
};

type VaultResourceRailAvailableRow<TProvider extends VaultResourceRailProvider> = {
  actions?: VaultResourceRailActionList;
  description?: string;
  href?: string;
  loadingDescription?: string;
  provider: TProvider;
  rowId: string;
  scope?: string;
  status: "available";
  value: string;
};

type VaultResourceRailMissingRow<TProvider extends VaultResourceRailProvider> = {
  actions?: VaultResourceRailActionList;
  description?: string;
  provider: TProvider;
  rowId: string;
  scope?: string;
  status: "missing";
  value: string;
};

type VaultResourceRailActionRequiredRow<TProvider extends VaultResourceRailProvider> = {
  actions: VaultResourceRailActionList;
  provider: TProvider;
  rowId: string;
  status: "action_required";
};

type VaultResourceRailFailedRow<TProvider extends VaultResourceRailProvider> = {
  actions?: VaultResourceRailActionList;
  description?: string;
  provider: TProvider;
  rowId: string;
  scope?: string;
  status: "failed";
  value: string;
};

export type VaultResourceRailRowState<
  TProvider extends VaultResourceRailProvider = VaultResourceRailProvider,
> =
  | VaultResourceRailActionRequiredRow<TProvider>
  | VaultResourceRailAvailableRow<TProvider>
  | VaultResourceRailFailedRow<TProvider>
  | VaultResourceRailLoadingRow<TProvider>
  | VaultResourceRailMissingRow<TProvider>;

export type VaultResourceRailRootState = {
  rootDirectory: string;
  rows: readonly VaultResourceRailRowState<"cloudflare" | "convex">[];
};

export type VaultResourceRailState = {
  attentionRows: readonly VaultResourceRailRowState<"cloudflare" | "convex">[];
  roots: readonly VaultResourceRailRootState[];
  vaultActionRows: readonly VaultResourceRailRowState<"cloudflare" | "convex">[];
};
