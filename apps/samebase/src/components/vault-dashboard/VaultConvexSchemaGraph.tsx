import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { useAction, useMutation, useQuery } from "convex/react";
import { clsx } from "clsx";
import { Database, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";

type ConvexSchemaGraphState = NonNullable<(typeof api.vault.convexSchemaGraph.get)["_returnType"]>;
export type VaultConvexSchemaGraphState = ConvexSchemaGraphState;
type ConvexSchemaGraphSnapshot = NonNullable<ConvexSchemaGraphState["snapshot"]>;
type ConvexSchemaGraphTable = ConvexSchemaGraphSnapshot["graph"]["tables"][number];
type ConvexSchemaGraphRelationship = ConvexSchemaGraphSnapshot["graph"]["relationships"][number];
type ConvexSchemaGraphLayout = ConvexSchemaGraphState["layout"][number];

type SchemaTableNodeData = {
  table: ConvexSchemaGraphTable;
};
type SchemaTableNode = Node<SchemaTableNodeData, "schemaTable">;
type SchemaGraphEdge = Edge;
type VaultConvexSchemaGraphVariant = "dashboard" | "route";

type VaultConvexSchemaGraphContentProps = {
  state: ConvexSchemaGraphState;
  refreshError: string | null;
  refreshPending: boolean;
  variant?: VaultConvexSchemaGraphVariant;
  onDeploymentChange?: (deploymentId: Id<"vaultConvexDeployments">) => void;
  onRefresh?: () => void;
  onSaveLayout?: (nodeId: string, x: number, y: number) => void;
};
export type VaultConvexSchemaGraphRouteContext = {
  appRoot: string;
  branch: string;
  repositoryFullName: string;
};
type VaultConvexSchemaGraphController = {
  state: ConvexSchemaGraphState | null | undefined;
  refreshError: string | null;
  refreshPending: boolean;
  onDeploymentChange: (deploymentId: Id<"vaultConvexDeployments">) => void;
  onRefresh: () => void;
  onSaveLayout: (nodeId: string, x: number, y: number) => void;
};

const SCHEMA_NODE_WIDTH = 300;
const SCHEMA_NODE_X_GAP = 380;
const SCHEMA_NODE_Y_GAP = 260;
const SCHEMA_NODE_COLUMNS = 3;
const FIELD_SOURCE_CLASS_NAMES = {
  declared: "text-foreground",
  inferred: "text-muted-foreground",
} satisfies Record<ConvexSchemaGraphTable["fields"][number]["source"], string>;
const TABLE_SOURCE_LABELS = {
  declared: "declared",
  inferred: "inferred",
  mixed: "declared + inferred",
} satisfies Record<ConvexSchemaGraphTable["source"], string>;

function formatSnapshotTimestamp(fetchedAt: number): string {
  return `${new Date(fetchedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatCount(count: number): string {
  return new Intl.NumberFormat("en-US").format(count);
}

function buildDefaultNodePosition(index: number): { x: number; y: number } {
  return {
    x: (index % SCHEMA_NODE_COLUMNS) * SCHEMA_NODE_X_GAP,
    y: Math.floor(index / SCHEMA_NODE_COLUMNS) * SCHEMA_NODE_Y_GAP,
  };
}

function buildLayoutMap(layout: ConvexSchemaGraphLayout[]): Map<string, { x: number; y: number }> {
  return new Map(layout.map((entry) => [entry.nodeId, { x: entry.x, y: entry.y }]));
}

function buildSchemaNodes(
  tables: ConvexSchemaGraphTable[],
  layout: ConvexSchemaGraphLayout[],
): SchemaTableNode[] {
  const layoutByNodeId = buildLayoutMap(layout);
  return tables.map((table, index) => ({
    id: table.name,
    type: "schemaTable",
    data: { table },
    position: layoutByNodeId.get(table.name) ?? buildDefaultNodePosition(index),
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: { width: SCHEMA_NODE_WIDTH },
  }));
}

function buildSchemaEdges(relationships: ConvexSchemaGraphRelationship[]): SchemaGraphEdge[] {
  return relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.fromTable,
    target: relationship.toTable,
    label: relationship.fromField,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: {
      strokeWidth: 1.5,
    },
  }));
}

function getSchemaGraphContainerClassName(variant: VaultConvexSchemaGraphVariant): string {
  return variant === "route"
    ? "flex h-full min-h-0 flex-1 flex-col"
    : "space-y-2 border-t border-border/50 pt-3";
}

function getSchemaGraphViewportClassName(variant: VaultConvexSchemaGraphVariant): string {
  return variant === "route"
    ? "h-full min-h-0 flex-1 overflow-hidden bg-background"
    : "h-[34rem] min-h-0 overflow-hidden border border-border/50";
}

function VaultConvexSchemaGraphStatus({
  children,
  variant,
}: {
  children: ReactNode;
  variant: VaultConvexSchemaGraphVariant;
}) {
  return (
    <section className={getSchemaGraphContainerClassName(variant)}>
      <div className="flex min-h-20 items-center justify-center text-sm text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function VaultConvexSchemaGraphCanvasStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background px-3 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function SchemaTableNode({ data }: NodeProps<SchemaTableNode>) {
  const table = data.table;
  const visibleFields = table.fields.slice(0, 9);
  const hiddenFieldCount = table.fields.length - visibleFields.length;
  return (
    <div className="w-[300px] overflow-hidden border border-border bg-background text-xs text-foreground">
      <div className="border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 truncate font-mono text-sm font-semibold">{table.name}</div>
          <div className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
            {TABLE_SOURCE_LABELS[table.source]}
          </div>
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span>{table.fields.length} fields</span>
          <span>{table.indexes.length} indexes</span>
          {table.documentCount !== undefined ? (
            <span>{formatCount(table.documentCount)} docs</span>
          ) : null}
        </div>
      </div>
      <div className="max-h-56 overflow-hidden py-1">
        {visibleFields.map((field) => (
          <div
            key={`${field.source}:${field.path}`}
            className="grid min-h-6 grid-cols-[minmax(0,1fr)_minmax(5rem,auto)] gap-2 px-3 py-0.5"
          >
            <div
              className={clsx("min-w-0 truncate font-mono", FIELD_SOURCE_CLASS_NAMES[field.source])}
              title={field.path}
            >
              {field.path}
              {field.optional ? "?" : ""}
            </div>
            <div className="min-w-0 truncate text-right font-mono text-muted-foreground">
              {field.targetTable ? `Id<${field.targetTable}>` : field.kind}
            </div>
          </div>
        ))}
        {hiddenFieldCount > 0 ? (
          <div className="px-3 py-1 text-[11px] text-muted-foreground">
            +{hiddenFieldCount} fields
          </div>
        ) : null}
      </div>
    </div>
  );
}

function VaultConvexSchemaGraphCanvas({
  state,
  variant = "dashboard",
  onSaveLayout,
}: {
  state: ConvexSchemaGraphState;
  variant?: VaultConvexSchemaGraphVariant;
  onSaveLayout?: (nodeId: string, x: number, y: number) => void;
}) {
  const snapshot = state.snapshot;
  const nodesFromSnapshot = useMemo(
    () => (snapshot ? buildSchemaNodes(snapshot.graph.tables, state.layout) : []),
    [snapshot, state.layout],
  );
  const edges = useMemo(
    () => (snapshot ? buildSchemaEdges(snapshot.graph.relationships) : []),
    [snapshot],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaTableNode>(nodesFromSnapshot);
  const nodeTypes = useMemo(() => ({ schemaTable: SchemaTableNode }), []);

  // React Flow owns transient drag state; reset it when Convex publishes a new snapshot or layout.
  useEffect(() => {
    setNodes(nodesFromSnapshot);
  }, [nodesFromSnapshot, setNodes]);

  if (!snapshot) {
    if (variant === "route") {
      return (
        <VaultConvexSchemaGraphCanvasStatus>No schema snapshot.</VaultConvexSchemaGraphCanvasStatus>
      );
    }
    return (
      <div className="border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
        Refresh to inspect the live Convex deployment.
      </div>
    );
  }

  return (
    <div className={getSchemaGraphViewportClassName(variant)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: variant === "route" ? 0.08 : 0.18 }}
        minZoom={variant === "route" ? 0.1 : 0.5}
        onNodeDragStop={(_event, node) => {
          onSaveLayout?.(node.id, node.position.x, node.position.y);
        }}
      >
        <Background gap={18} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function VaultConvexSchemaGraphContent({
  state,
  refreshError,
  refreshPending,
  variant = "dashboard",
  onDeploymentChange,
  onRefresh,
  onSaveLayout,
}: VaultConvexSchemaGraphContentProps) {
  const snapshot = state.snapshot;
  const selectedDeploymentId = state.selectedDeploymentId ?? undefined;
  const selectedDeployment = state.deployments.find(
    (deployment) => deployment._id === state.selectedDeploymentId,
  );

  const handleDeploymentValueChange = useCallback(
    (value: string) => {
      const deployment = state.deployments.find((item) => item._id === value);
      if (deployment) {
        onDeploymentChange?.(deployment._id);
      }
    },
    [onDeploymentChange, state.deployments],
  );

  return (
    <section className={getSchemaGraphContainerClassName(variant)}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">Convex schema</span>
          </div>
          <div className="mt-0.5 min-w-0 truncate text-xs text-muted-foreground">
            {snapshot
              ? `${snapshot.graph.tables.length} tables · ${snapshot.graph.relationships.length} relationships · ${formatSnapshotTimestamp(snapshot.fetchedAt)}`
              : selectedDeployment
                ? `${selectedDeployment.deploymentName} has no snapshot`
                : "No Convex deployment"}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {state.deployments.length > 1 ? (
            <Select value={selectedDeploymentId} onValueChange={handleDeploymentValueChange}>
              <SelectTrigger className="h-8 min-w-44 max-w-60 text-xs">
                <SelectValue />
              </SelectTrigger>
              <AppSelectContent>
                {state.deployments.map((deployment) => (
                  <AppSelectItem key={deployment._id} value={deployment._id}>
                    {deployment.appRoot === "."
                      ? deployment.deploymentName
                      : `${deployment.appRoot}: ${deployment.deploymentName}`}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </Select>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!state.selectedDeploymentId || refreshPending || !onRefresh}
            onClick={onRefresh}
          >
            {refreshPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {refreshPending ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </div>

      {refreshError ? <div className="text-xs text-destructive">{refreshError}</div> : null}

      <VaultConvexSchemaGraphCanvas state={state} variant={variant} onSaveLayout={onSaveLayout} />

      {snapshot && snapshot.graph.warnings.length > 0 ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          {snapshot.graph.warnings.slice(0, 3).map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function VaultConvexSchemaGraphRouteSidebar({
  context,
  state,
  refreshError,
  refreshPending,
  onDeploymentChange,
  onRefresh,
}: {
  context: VaultConvexSchemaGraphRouteContext;
  state: VaultConvexSchemaGraphState | null | undefined;
  refreshError: string | null;
  refreshPending: boolean;
  onDeploymentChange: (deploymentId: Id<"vaultConvexDeployments">) => void;
  onRefresh: () => void;
}) {
  const snapshot = state?.snapshot ?? null;
  const selectedDeploymentId = state?.selectedDeploymentId ?? undefined;
  const selectedDeployment = state?.deployments.find(
    (deployment) => deployment._id === state.selectedDeploymentId,
  );

  const handleDeploymentValueChange = useCallback(
    (value: string) => {
      const deployment = state?.deployments.find((item) => item._id === value);
      if (deployment) {
        onDeploymentChange(deployment._id);
      }
    },
    [onDeploymentChange, state?.deployments],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-2 py-2 text-sm">
      <div className="grid min-w-0 gap-1 border-b border-border/60 pb-3">
        <div className="flex min-w-0 items-center gap-2 font-medium">
          <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">Convex schema</span>
        </div>
        <div className="min-w-0 truncate text-xs text-muted-foreground">
          {context.repositoryFullName}
        </div>
        <div className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {context.branch}
        </div>
      </div>

      {state === undefined ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Loading schema</span>
        </div>
      ) : state === null ? (
        <div className="text-xs text-muted-foreground">Schema unavailable.</div>
      ) : state.deployments.length === 0 ? (
        <div className="text-xs text-muted-foreground">No Convex deployment.</div>
      ) : (
        <>
          <div className="grid gap-2">
            {state.deployments.length > 1 ? (
              <Select value={selectedDeploymentId} onValueChange={handleDeploymentValueChange}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <AppSelectContent>
                  {state.deployments.map((deployment) => (
                    <AppSelectItem key={deployment._id} value={deployment._id}>
                      {deployment.appRoot === "."
                        ? deployment.deploymentName
                        : `${deployment.appRoot}: ${deployment.deploymentName}`}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </Select>
            ) : (
              <div className="min-w-0 truncate text-xs text-muted-foreground">
                {selectedDeployment?.deploymentName}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!state.selectedDeploymentId || refreshPending}
              onClick={onRefresh}
            >
              {refreshPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {refreshPending ? "Refreshing" : "Refresh"}
            </Button>
          </div>

          <div className="grid gap-1 text-xs text-muted-foreground">
            <div className="flex min-w-0 justify-between gap-2">
              <span>App root</span>
              <span className="min-w-0 truncate font-mono text-foreground">{context.appRoot}</span>
            </div>
            <div className="flex min-w-0 justify-between gap-2">
              <span>Tables</span>
              <span className="font-mono text-foreground">
                {snapshot ? formatCount(snapshot.graph.tables.length) : "-"}
              </span>
            </div>
            <div className="flex min-w-0 justify-between gap-2">
              <span>Relationships</span>
              <span className="font-mono text-foreground">
                {snapshot ? formatCount(snapshot.graph.relationships.length) : "-"}
              </span>
            </div>
            <div className="grid min-w-0 gap-0.5">
              <span>Snapshot</span>
              <span className="min-w-0 truncate font-mono text-foreground">
                {snapshot ? formatSnapshotTimestamp(snapshot.fetchedAt) : "No snapshot"}
              </span>
            </div>
          </div>

          {refreshError ? <div className="text-xs text-destructive">{refreshError}</div> : null}

          {snapshot && snapshot.graph.warnings.length > 0 ? (
            <div className="grid gap-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              {snapshot.graph.warnings.slice(0, 3).map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function useVaultConvexSchemaGraphController({
  appRoot,
  vaultId,
}: {
  appRoot?: string;
  vaultId: Id<"vaults">;
}): VaultConvexSchemaGraphController {
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<Id<"vaultConvexDeployments">>();
  const [refreshPending, setRefreshPending] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const queryArgs = useMemo(
    () =>
      selectedDeploymentId
        ? { vaultId, deploymentId: selectedDeploymentId }
        : appRoot !== undefined
          ? { vaultId, appRoot }
          : { vaultId },
    [appRoot, selectedDeploymentId, vaultId],
  );
  const state = useQuery(api.vault.convexSchemaGraph.get, queryArgs);
  const refresh = useAction(api.vault.convexSchemaGraph.refresh);
  const saveLayout = useMutation(api.vault.convexSchemaGraph.saveLayout);

  useEffect(() => {
    setSelectedDeploymentId(undefined);
  }, [appRoot, vaultId]);

  const handleRefresh = useCallback(async () => {
    const deploymentId = state?.selectedDeploymentId;
    if (!deploymentId) {
      return;
    }
    setRefreshPending(true);
    setRefreshError(null);
    try {
      await refresh({ vaultId, deploymentId });
      toast({ title: "Convex schema refreshed" });
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Could not refresh schema.");
    } finally {
      setRefreshPending(false);
    }
  }, [refresh, state?.selectedDeploymentId, vaultId]);

  const handleSaveLayout = useCallback(
    (nodeId: string, x: number, y: number) => {
      const deploymentId = state?.selectedDeploymentId;
      if (!deploymentId) {
        return;
      }
      setLayoutError(null);
      void saveLayout({
        vaultId,
        deploymentId,
        nodeId,
        x,
        y,
      }).catch((error) => {
        setLayoutError(error instanceof Error ? error.message : "Could not save graph layout.");
      });
    },
    [saveLayout, state?.selectedDeploymentId, vaultId],
  );

  return {
    state,
    refreshPending,
    refreshError: refreshError ?? layoutError,
    onDeploymentChange: setSelectedDeploymentId,
    onRefresh: () => {
      void handleRefresh();
    },
    onSaveLayout: handleSaveLayout,
  };
}

export function VaultConvexSchemaGraph({
  appRoot,
  vaultId,
  variant = "dashboard",
}: {
  appRoot?: string;
  vaultId: Id<"vaults">;
  variant?: VaultConvexSchemaGraphVariant;
}) {
  const controller = useVaultConvexSchemaGraphController({ appRoot, vaultId });
  const { state } = controller;

  if (state === undefined) {
    return (
      <section className={getSchemaGraphContainerClassName(variant)}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span>Convex schema</span>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  if (state === null || state.deployments.length === 0) {
    if (variant === "route") {
      return (
        <VaultConvexSchemaGraphStatus variant={variant}>
          No Convex deployment.
        </VaultConvexSchemaGraphStatus>
      );
    }
    return null;
  }

  return (
    <VaultConvexSchemaGraphContent
      state={state}
      variant={variant}
      refreshPending={controller.refreshPending}
      refreshError={controller.refreshError}
      onDeploymentChange={controller.onDeploymentChange}
      onRefresh={controller.onRefresh}
      onSaveLayout={controller.onSaveLayout}
    />
  );
}

export function VaultConvexSchemaGraphRouteWorkspaceContent({
  context,
  state,
  refreshError,
  refreshPending,
  onDeploymentChange,
  onRefresh,
  onSaveLayout,
}: {
  context: VaultConvexSchemaGraphRouteContext;
  state: VaultConvexSchemaGraphState | null | undefined;
  refreshError: string | null;
  refreshPending: boolean;
  onDeploymentChange: (deploymentId: Id<"vaultConvexDeployments">) => void;
  onRefresh: () => void;
  onSaveLayout: (nodeId: string, x: number, y: number) => void;
}) {
  return (
    <AppWorkspaceRouteChrome
      left={{
        content: (
          <VaultConvexSchemaGraphRouteSidebar
            context={context}
            state={state}
            refreshPending={refreshPending}
            refreshError={refreshError}
            onDeploymentChange={onDeploymentChange}
            onRefresh={onRefresh}
          />
        ),
      }}
      leftToggleVisibility="all"
      right={null}
      rightToggleVisibility="hidden"
      shortcutPaneSide="left"
    >
      <div data-testid="vault-schema-page" className="flex h-full min-h-0 flex-col bg-background">
        {state === undefined ? (
          <VaultConvexSchemaGraphCanvasStatus>Loading schema</VaultConvexSchemaGraphCanvasStatus>
        ) : state === null ? (
          <VaultConvexSchemaGraphCanvasStatus>
            Schema unavailable.
          </VaultConvexSchemaGraphCanvasStatus>
        ) : state.deployments.length === 0 ? (
          <VaultConvexSchemaGraphCanvasStatus>
            No Convex deployment.
          </VaultConvexSchemaGraphCanvasStatus>
        ) : (
          <VaultConvexSchemaGraphCanvas state={state} variant="route" onSaveLayout={onSaveLayout} />
        )}
      </div>
    </AppWorkspaceRouteChrome>
  );
}

export function VaultConvexSchemaGraphRouteWorkspace({
  context,
  vaultId,
}: {
  context: VaultConvexSchemaGraphRouteContext;
  vaultId: Id<"vaults">;
}) {
  const controller = useVaultConvexSchemaGraphController({
    appRoot: context.appRoot,
    vaultId,
  });

  return (
    <VaultConvexSchemaGraphRouteWorkspaceContent
      context={context}
      state={controller.state}
      refreshPending={controller.refreshPending}
      refreshError={controller.refreshError}
      onDeploymentChange={controller.onDeploymentChange}
      onRefresh={controller.onRefresh}
      onSaveLayout={controller.onSaveLayout}
    />
  );
}
