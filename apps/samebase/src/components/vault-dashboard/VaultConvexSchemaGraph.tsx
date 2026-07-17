import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import {
  SAMEBASE_SCHEMA_GRAPH_ZONE_LAYOUT_VERSION,
  SAMEBASE_SCHEMA_GRAPH_ZONES,
  readSamebaseSchemaGraphZoneId,
  type SamebaseSchemaGraphZone,
  type SamebaseSchemaGraphZoneId,
} from "@/components/vault-dashboard/samebaseSchemaGraphZones";
import { useAction, useMutation, useQuery } from "convex/react";
import { clsx } from "clsx";
import { Database, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
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
type SchemaZoneSummary = {
  zone: SamebaseSchemaGraphZone;
  tableCount: number;
  relationshipCount: number;
  crossZoneRelationshipCount: number;
};
type SchemaZoneNodeData = {
  summary: SchemaZoneSummary;
};
type SchemaZoneNode = Node<SchemaZoneNodeData, "schemaZone">;
type SchemaGraphNode = SchemaTableNode | SchemaZoneNode;
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
  branch: string;
  deploymentId: string;
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

const SCHEMA_NODE_MIN_WIDTH = 260;
const SCHEMA_NODE_MAX_WIDTH = 520;
const SCHEMA_NODE_HORIZONTAL_PADDING_PX = 24;
const SCHEMA_NODE_TITLE_CHARACTER_WIDTH_PX = 8;
const SCHEMA_NODE_TITLE_LINE_HEIGHT = 18;
const SCHEMA_NODE_HEADER_BASE_HEIGHT = 76;
const SCHEMA_NODE_ROW_HEIGHT = 24;
const SCHEMA_NODE_HIDDEN_FIELDS_HEIGHT = 24;
const SCHEMA_NODE_VISIBLE_FIELD_LIMIT = 4;
const SCHEMA_ZONE_PADDING_X = 36;
const SCHEMA_ZONE_PADDING_BOTTOM = 36;
const SCHEMA_ZONE_HEADER_HEIGHT = 98;
const SCHEMA_ZONE_TABLE_X_GAP = 48;
const SCHEMA_ZONE_TABLE_Y_GAP = 40;
const SCHEMA_ZONE_X_GAP = 176;
const SCHEMA_ZONE_Y_GAP = 132;
const SCHEMA_ZONE_TABLE_COLUMN_LIMIT = 2;
const SCHEMA_INACTIVE_EDGE_OPACITY = 0.24;
const SCHEMA_ACTIVE_EDGE_OPACITY = 0.72;
const SCHEMA_ROUTE_READABLE_TABLE_LIMIT = 16;
const SCHEMA_ROUTE_READABLE_ZOOM = 0.55;
const FIELD_SOURCE_CLASS_NAMES = {
  declared: "text-foreground",
  inferred: "text-muted-foreground",
} satisfies Record<ConvexSchemaGraphTable["fields"][number]["source"], string>;
const TABLE_SOURCE_LABELS = {
  declared: "declared schema",
  inferred: "sampled documents",
  mixed: "schema + sampled documents",
} satisfies Record<ConvexSchemaGraphTable["source"], string>;

function readSchemaFieldTargetTables(field: ConvexSchemaGraphTable["fields"][number]): string[] {
  if (field.targetTables !== undefined) {
    return field.targetTables;
  }
  return field.targetTable ? [field.targetTable] : [];
}

function hasSchemaFieldRelationship(field: ConvexSchemaGraphTable["fields"][number]): boolean {
  return readSchemaFieldTargetTables(field).length > 0;
}

function formatSchemaFieldKind(field: ConvexSchemaGraphTable["fields"][number]): string {
  const targetTables = readSchemaFieldTargetTables(field);
  if (targetTables.length === 0) {
    return field.kind;
  }
  return `Id<${targetTables.join(" | ")}>`;
}

function formatSnapshotTimestamp(fetchedAt: number): string {
  return `${new Date(fetchedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatCount(count: number): string {
  return new Intl.NumberFormat("en-US").format(count);
}

function buildSchemaLayoutNodeId(tableName: string): string {
  return `${SAMEBASE_SCHEMA_GRAPH_ZONE_LAYOUT_VERSION}:${tableName}`;
}

function buildLayoutMap(layout: ConvexSchemaGraphLayout[]): Map<string, { x: number; y: number }> {
  const prefix = `${SAMEBASE_SCHEMA_GRAPH_ZONE_LAYOUT_VERSION}:`;
  const positions = new Map<string, { x: number; y: number }>();
  for (const entry of layout) {
    if (!entry.nodeId.startsWith(prefix)) {
      continue;
    }
    positions.set(entry.nodeId.slice(prefix.length), { x: entry.x, y: entry.y });
  }
  return positions;
}

function buildSchemaLayoutKey(
  snapshot: ConvexSchemaGraphSnapshot,
  layout: ConvexSchemaGraphLayout[],
): string {
  const savedLayoutKey = [...buildLayoutMap(layout)]
    .map(([nodeId, position]) => `${nodeId}:${position.x}:${position.y}`)
    .sort()
    .join("|");
  return `${SAMEBASE_SCHEMA_GRAPH_ZONE_LAYOUT_VERSION}:${snapshot.schemaHash}:${savedLayoutKey}`;
}

function buildSchemaStructureLayoutKey(snapshot: ConvexSchemaGraphSnapshot): string {
  return `${SAMEBASE_SCHEMA_GRAPH_ZONE_LAYOUT_VERSION}:${snapshot.schemaHash}`;
}

function getSchemaNodeWidth(table: ConvexSchemaGraphTable): number {
  return Math.max(
    SCHEMA_NODE_MIN_WIDTH,
    Math.min(
      SCHEMA_NODE_MAX_WIDTH,
      SCHEMA_NODE_HORIZONTAL_PADDING_PX + table.name.length * SCHEMA_NODE_TITLE_CHARACTER_WIDTH_PX,
    ),
  );
}

function getSchemaNodeTitleLineCount(table: ConvexSchemaGraphTable): number {
  const textWidth = table.name.length * SCHEMA_NODE_TITLE_CHARACTER_WIDTH_PX;
  const availableWidth = getSchemaNodeWidth(table) - SCHEMA_NODE_HORIZONTAL_PADDING_PX;
  return Math.max(1, Math.ceil(textWidth / availableWidth));
}

function readSchemaNodeVisibleFields(
  table: ConvexSchemaGraphTable,
): ConvexSchemaGraphTable["fields"] {
  const relationshipFields: ConvexSchemaGraphTable["fields"] = [];
  const otherFields: ConvexSchemaGraphTable["fields"] = [];
  for (const field of table.fields) {
    if (hasSchemaFieldRelationship(field)) {
      relationshipFields.push(field);
    } else {
      otherFields.push(field);
    }
  }
  return [...relationshipFields, ...otherFields].slice(0, SCHEMA_NODE_VISIBLE_FIELD_LIMIT);
}

function countSchemaRelationshipFields(table: ConvexSchemaGraphTable): number {
  let count = 0;
  for (const field of table.fields) {
    if (hasSchemaFieldRelationship(field)) {
      count += 1;
    }
  }
  return count;
}

function getSchemaNodeHeight(table: ConvexSchemaGraphTable): number {
  const visibleFieldCount = readSchemaNodeVisibleFields(table).length;
  const hiddenFieldsHeight =
    table.fields.length > visibleFieldCount ? SCHEMA_NODE_HIDDEN_FIELDS_HEIGHT : 0;
  return (
    SCHEMA_NODE_HEADER_BASE_HEIGHT +
    (getSchemaNodeTitleLineCount(table) - 1) * SCHEMA_NODE_TITLE_LINE_HEIGHT +
    visibleFieldCount * SCHEMA_NODE_ROW_HEIGHT +
    hiddenFieldsHeight
  );
}

function buildTableZoneMap(
  tables: ConvexSchemaGraphTable[],
): Map<string, SamebaseSchemaGraphZoneId> {
  return new Map(tables.map((table) => [table.name, readSamebaseSchemaGraphZoneId(table.name)]));
}

function buildTableDegreeMap(
  tables: ConvexSchemaGraphTable[],
  relationships: ConvexSchemaGraphRelationship[],
): Map<string, number> {
  const tableDegrees = new Map(tables.map((table) => [table.name, 0]));
  for (const relationship of relationships) {
    const fromDegree = tableDegrees.get(relationship.fromTable);
    if (fromDegree !== undefined) {
      tableDegrees.set(relationship.fromTable, fromDegree + 1);
    }

    const toDegree = tableDegrees.get(relationship.toTable);
    if (toDegree !== undefined) {
      tableDegrees.set(relationship.toTable, toDegree + 1);
    }
  }
  return tableDegrees;
}

function compareSchemaTablesByGraphRole(
  tableDegrees: Map<string, number>,
  left: ConvexSchemaGraphTable,
  right: ConvexSchemaGraphTable,
): number {
  const degreeOrder = (tableDegrees.get(right.name) ?? 0) - (tableDegrees.get(left.name) ?? 0);
  if (degreeOrder !== 0) {
    return degreeOrder;
  }

  return left.name.localeCompare(right.name);
}

function buildSchemaZoneSummaries(
  tables: ConvexSchemaGraphTable[],
  relationships: ConvexSchemaGraphRelationship[],
): SchemaZoneSummary[] {
  const tableZones = buildTableZoneMap(tables);
  const summariesByZoneId = new Map(
    SAMEBASE_SCHEMA_GRAPH_ZONES.map((zone) => [
      zone.id,
      {
        zone,
        tableCount: 0,
        relationshipCount: 0,
        crossZoneRelationshipCount: 0,
      },
    ]),
  );

  for (const table of tables) {
    const zoneId = tableZones.get(table.name) ?? "other";
    const summary = summariesByZoneId.get(zoneId);
    if (summary) {
      summary.tableCount += 1;
    }
  }

  for (const relationship of relationships) {
    const fromZoneId = tableZones.get(relationship.fromTable);
    const toZoneId = tableZones.get(relationship.toTable);
    if (!fromZoneId || !toZoneId) {
      continue;
    }

    if (fromZoneId === toZoneId) {
      const summary = summariesByZoneId.get(fromZoneId);
      if (summary) {
        summary.relationshipCount += 1;
      }
      continue;
    }

    const fromSummary = summariesByZoneId.get(fromZoneId);
    if (fromSummary) {
      fromSummary.crossZoneRelationshipCount += 1;
    }
    const toSummary = summariesByZoneId.get(toZoneId);
    if (toSummary) {
      toSummary.crossZoneRelationshipCount += 1;
    }
  }

  const summaries: SchemaZoneSummary[] = [];
  for (const zone of SAMEBASE_SCHEMA_GRAPH_ZONES) {
    const summary = summariesByZoneId.get(zone.id);
    if (summary && summary.tableCount > 0) {
      summaries.push(summary);
    }
  }

  return summaries;
}

function buildSchemaTableNode(table: ConvexSchemaGraphTable, position: { x: number; y: number }) {
  return {
    id: table.name,
    type: "schemaTable",
    data: { table },
    position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    zIndex: 2,
    style: { width: getSchemaNodeWidth(table) },
  } satisfies SchemaTableNode;
}

function buildAutomaticSchemaTablePositions(
  tables: ConvexSchemaGraphTable[],
  relationships: ConvexSchemaGraphRelationship[],
): Map<string, { x: number; y: number }> {
  const tableDegrees = buildTableDegreeMap(tables, relationships);
  const tablesByZoneId = new Map<SamebaseSchemaGraphZoneId, ConvexSchemaGraphTable[]>();
  for (const table of tables) {
    const zoneId = readSamebaseSchemaGraphZoneId(table.name);
    const zoneTables = tablesByZoneId.get(zoneId) ?? [];
    zoneTables.push(table);
    tablesByZoneId.set(zoneId, zoneTables);
  }

  const zoneLayouts = SAMEBASE_SCHEMA_GRAPH_ZONES.map((zone) => {
    const zoneTables = [...(tablesByZoneId.get(zone.id) ?? [])].sort((left, right) =>
      compareSchemaTablesByGraphRole(tableDegrees, left, right),
    );
    const columnCount = zoneTables.length > 1 ? SCHEMA_ZONE_TABLE_COLUMN_LIMIT : 1;
    const rowsPerColumn = Math.max(1, Math.ceil(zoneTables.length / columnCount));
    const columnWidths = Array.from({ length: columnCount }, () => 0);
    const rowHeights = Array.from({ length: rowsPerColumn }, () => 0);
    const tableSlots = zoneTables.map((table, index) => {
      const columnIndex = Math.floor(index / rowsPerColumn);
      const rowIndex = index % rowsPerColumn;
      const width = getSchemaNodeWidth(table);
      const height = getSchemaNodeHeight(table);
      columnWidths[columnIndex] = Math.max(columnWidths[columnIndex] ?? 0, width);
      rowHeights[rowIndex] = Math.max(rowHeights[rowIndex] ?? 0, height);
      return { columnIndex, rowIndex, table };
    });
    const contentWidth =
      columnWidths.reduce((total, width) => total + width, 0) +
      Math.max(0, columnWidths.length - 1) * SCHEMA_ZONE_TABLE_X_GAP;
    const contentHeight =
      rowHeights.reduce((total, height) => total + height, 0) +
      Math.max(0, rowHeights.length - 1) * SCHEMA_ZONE_TABLE_Y_GAP;

    return {
      zone,
      columnWidths,
      contentHeight,
      contentWidth,
      height: SCHEMA_ZONE_HEADER_HEIGHT + contentHeight + SCHEMA_ZONE_PADDING_BOTTOM,
      rowHeights,
      tableSlots,
      width: SCHEMA_ZONE_PADDING_X * 2 + contentWidth,
    };
  }).filter((zoneLayout) => zoneLayout.tableSlots.length > 0);

  const columnWidths = new Map<number, number>();
  for (const zoneLayout of zoneLayouts) {
    columnWidths.set(
      zoneLayout.zone.column,
      Math.max(columnWidths.get(zoneLayout.zone.column) ?? 0, zoneLayout.width),
    );
  }

  const columnX = new Map<number, number>();
  let nextColumnX = 0;
  for (const column of [...columnWidths.keys()].sort((left, right) => left - right)) {
    columnX.set(column, nextColumnX);
    nextColumnX += (columnWidths.get(column) ?? 0) + SCHEMA_ZONE_X_GAP;
  }

  const columnY = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  for (const zoneLayout of zoneLayouts.sort((left, right) => {
    const columnOrder = left.zone.column - right.zone.column;
    if (columnOrder !== 0) {
      return columnOrder;
    }
    return left.zone.order - right.zone.order;
  })) {
    const zoneX = columnX.get(zoneLayout.zone.column) ?? 0;
    const zoneY = columnY.get(zoneLayout.zone.column) ?? 0;
    const columnOffsets = zoneLayout.columnWidths.map((_, index) => {
      const previousWidths = zoneLayout.columnWidths
        .slice(0, index)
        .reduce((total, width) => total + width, 0);
      return previousWidths + index * SCHEMA_ZONE_TABLE_X_GAP;
    });
    const rowOffsets = zoneLayout.rowHeights.map((_, index) => {
      const previousHeights = zoneLayout.rowHeights
        .slice(0, index)
        .reduce((total, height) => total + height, 0);
      return previousHeights + index * SCHEMA_ZONE_TABLE_Y_GAP;
    });

    for (const tableSlot of zoneLayout.tableSlots) {
      positions.set(tableSlot.table.name, {
        x: zoneX + SCHEMA_ZONE_PADDING_X + (columnOffsets[tableSlot.columnIndex] ?? 0),
        y: zoneY + SCHEMA_ZONE_HEADER_HEIGHT + (rowOffsets[tableSlot.rowIndex] ?? 0),
      });
    }

    columnY.set(zoneLayout.zone.column, zoneY + zoneLayout.height + SCHEMA_ZONE_Y_GAP);
  }

  return positions;
}

function buildSchemaTableNodes(
  tables: ConvexSchemaGraphTable[],
  relationships: ConvexSchemaGraphRelationship[],
  layout: ConvexSchemaGraphLayout[],
  currentPositions: Map<string, { x: number; y: number }>,
): SchemaTableNode[] {
  const layoutByNodeId = buildLayoutMap(layout);
  const automaticLayoutByNodeId = buildAutomaticSchemaTablePositions(tables, relationships);
  return tables.map((table) =>
    buildSchemaTableNode(
      table,
      layoutByNodeId.get(table.name) ??
        currentPositions.get(table.name) ??
        automaticLayoutByNodeId.get(table.name) ?? { x: 0, y: 0 },
    ),
  );
}

function buildSchemaZoneNodes(
  tables: ConvexSchemaGraphTable[],
  relationships: ConvexSchemaGraphRelationship[],
  tableNodes: SchemaTableNode[],
): SchemaZoneNode[] {
  const summaries = buildSchemaZoneSummaries(tables, relationships);
  return summaries.map((summary) => {
    const zoneTableNodes = tableNodes.filter(
      (node) => readSamebaseSchemaGraphZoneId(node.data.table.name) === summary.zone.id,
    );
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const node of zoneTableNodes) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + getSchemaNodeWidth(node.data.table));
      maxY = Math.max(maxY, node.position.y + getSchemaNodeHeight(node.data.table));
    }

    const position = {
      x: minX - SCHEMA_ZONE_PADDING_X,
      y: minY - SCHEMA_ZONE_HEADER_HEIGHT,
    };
    return {
      id: `schema-zone-${summary.zone.id}`,
      type: "schemaZone",
      data: { summary },
      position,
      draggable: false,
      selectable: false,
      zIndex: 0,
      style: {
        height: maxY - position.y + SCHEMA_ZONE_PADDING_BOTTOM,
        pointerEvents: "none",
        width: maxX - position.x + SCHEMA_ZONE_PADDING_X,
      },
    } satisfies SchemaZoneNode;
  });
}

function buildSchemaNodes(
  tables: ConvexSchemaGraphTable[],
  relationships: ConvexSchemaGraphRelationship[],
  layout: ConvexSchemaGraphLayout[],
  currentPositions: Map<string, { x: number; y: number }>,
): SchemaGraphNode[] {
  const tableNodes = buildSchemaTableNodes(tables, relationships, layout, currentPositions);
  return [...buildSchemaZoneNodes(tables, relationships, tableNodes), ...tableNodes];
}

function buildCurrentSchemaTablePositions(
  nodes: SchemaGraphNode[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    if (node.type === "schemaTable") {
      positions.set(node.id, node.position);
    }
  }
  return positions;
}

function buildSchemaEdges(
  relationships: ConvexSchemaGraphRelationship[],
  activeTableId: string | null,
): SchemaGraphEdge[] {
  return relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.fromTable,
    target: relationship.toTable,
    label:
      activeTableId === relationship.fromTable || activeTableId === relationship.toTable
        ? relationship.fromField
        : undefined,
    labelBgPadding: [4, 3],
    labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.92 },
    labelStyle: { fill: "hsl(var(--muted-foreground))", fontSize: 10 },
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: {
      strokeOpacity:
        activeTableId === null
          ? SCHEMA_INACTIVE_EDGE_OPACITY
          : activeTableId === relationship.fromTable || activeTableId === relationship.toTable
            ? SCHEMA_ACTIVE_EDGE_OPACITY
            : 0.06,
      strokeWidth:
        activeTableId === relationship.fromTable || activeTableId === relationship.toTable ? 2 : 1,
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

function SchemaZoneNode({ data }: NodeProps<SchemaZoneNode>) {
  const summary = data.summary;
  return (
    <div
      className="h-full w-full border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground"
      data-schema-graph-zone={summary.zone.id}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{summary.zone.label}</div>
          <div className="mt-1 leading-snug">{summary.zone.description}</div>
        </div>
        <div className="shrink-0 text-right font-mono text-[11px] text-foreground">
          {formatCount(summary.tableCount)} tables
        </div>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wide">
        <span>{formatCount(summary.relationshipCount)} internal</span>
        <span>{formatCount(summary.crossZoneRelationshipCount)} cross-zone</span>
      </div>
    </div>
  );
}

function SchemaTableNode({ data }: NodeProps<SchemaTableNode>) {
  const table = data.table;
  const visibleFields = readSchemaNodeVisibleFields(table);
  const hiddenFieldCount = table.fields.length - visibleFields.length;
  const relationshipFieldCount = countSchemaRelationshipFields(table);
  return (
    <div
      className="relative overflow-hidden border border-border bg-background text-xs text-foreground"
      style={{ width: getSchemaNodeWidth(table) }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-border !bg-background"
      />
      <div className="border-b border-border px-3 py-2">
        <div className="break-words font-mono text-sm font-semibold leading-snug">{table.name}</div>
        <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {TABLE_SOURCE_LABELS[table.source]}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span>{table.fields.length} fields</span>
          {relationshipFieldCount > 0 ? <span>{relationshipFieldCount} links</span> : null}
          <span>{table.indexes.length} indexes</span>
          {table.documentCount !== undefined ? (
            <span>{formatCount(table.documentCount)} docs</span>
          ) : null}
        </div>
      </div>
      <div className="max-h-56 overflow-hidden py-1">
        {visibleFields.map((field) => (
          <div
            key={`${field.source}:${field.path}:${formatSchemaFieldKind(field)}`}
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
              {formatSchemaFieldKind(field)}
            </div>
          </div>
        ))}
        {hiddenFieldCount > 0 ? (
          <div className="px-3 py-1 text-[11px] text-muted-foreground">
            +{hiddenFieldCount} fields
          </div>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-border !bg-background"
      />
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
  const [hoveredTableId, setHoveredTableId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const activeTableId = hoveredTableId ?? selectedTableId;
  const fallbackNodesFromSnapshot = useMemo(
    () =>
      snapshot
        ? buildSchemaNodes(
            snapshot.graph.tables,
            snapshot.graph.relationships,
            state.layout,
            new Map<string, { x: number; y: number }>(),
          )
        : [],
    [snapshot, state.layout],
  );
  const edges = useMemo(
    () => (snapshot ? buildSchemaEdges(snapshot.graph.relationships, activeTableId) : []),
    [activeTableId, snapshot],
  );
  const layoutKey = useMemo(
    () => (snapshot ? buildSchemaLayoutKey(snapshot, state.layout) : "empty"),
    [snapshot, state.layout],
  );
  const structureLayoutKey = useMemo(
    () => (snapshot ? buildSchemaStructureLayoutKey(snapshot) : "empty"),
    [snapshot],
  );
  const fitViewOptions = useMemo(() => ({ padding: variant === "route" ? 0.08 : 0.18 }), [variant]);
  const [nodes, setNodes, onNodesChange] =
    useNodesState<SchemaGraphNode>(fallbackNodesFromSnapshot);
  const [readyLayoutKey, setReadyLayoutKey] = useState<string | null>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance<SchemaGraphNode, SchemaGraphEdge> | null>(
    null,
  );
  const lastAppliedSchemaKeyRef = useRef<string | null>(null);
  const nodeTypes = useMemo(
    () => ({ schemaTable: SchemaTableNode, schemaZone: SchemaZoneNode }),
    [],
  );
  const layoutReady = readyLayoutKey === layoutKey;
  const fitSchemaGraphView = useCallback(() => {
    if (!reactFlowInstanceRef.current) {
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (
          variant === "route" &&
          (snapshot?.graph.tables.length ?? 0) > SCHEMA_ROUTE_READABLE_TABLE_LIMIT
        ) {
          void reactFlowInstanceRef.current?.setViewport({
            x: 24,
            y: 24,
            zoom: SCHEMA_ROUTE_READABLE_ZOOM,
          });
          return;
        }

        void reactFlowInstanceRef.current?.fitView(fitViewOptions);
      });
    });
  }, [fitViewOptions, snapshot?.graph.tables.length, variant]);

  // React Flow owns transient drag state; only schema changes should rebuild and refit the canvas.
  useEffect(() => {
    if (!snapshot) {
      setNodes([]);
      setReadyLayoutKey(layoutKey);
      lastAppliedSchemaKeyRef.current = "empty";
      return;
    }

    if (lastAppliedSchemaKeyRef.current === structureLayoutKey) {
      setNodes((currentNodes) =>
        buildSchemaNodes(
          snapshot.graph.tables,
          snapshot.graph.relationships,
          state.layout,
          buildCurrentSchemaTablePositions(currentNodes),
        ),
      );
      setReadyLayoutKey(layoutKey);
      return;
    }

    setReadyLayoutKey(null);
    setNodes(fallbackNodesFromSnapshot);
    lastAppliedSchemaKeyRef.current = structureLayoutKey;
    setReadyLayoutKey(layoutKey);
    fitSchemaGraphView();
  }, [
    fallbackNodesFromSnapshot,
    fitSchemaGraphView,
    layoutKey,
    setNodes,
    snapshot,
    state.layout,
    structureLayoutKey,
  ]);

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
    <div
      className={getSchemaGraphViewportClassName(variant)}
      data-schema-graph-layout={layoutReady ? "ready" : "pending"}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        nodesConnectable={false}
        fitViewOptions={fitViewOptions}
        minZoom={0.1}
        onInit={(instance) => {
          reactFlowInstanceRef.current = instance;
          fitSchemaGraphView();
        }}
        onNodeClick={(_event, node) => {
          if (node.type === "schemaTable") {
            setSelectedTableId(node.id);
          }
        }}
        onNodeDragStop={(_event, node) => {
          if (node.type !== "schemaTable") {
            return;
          }
          onSaveLayout?.(buildSchemaLayoutNodeId(node.id), node.position.x, node.position.y);
        }}
        onNodeMouseEnter={(_event, node) => {
          if (node.type === "schemaTable") {
            setHoveredTableId(node.id);
          }
        }}
        onNodeMouseLeave={() => {
          setHoveredTableId(null);
        }}
        onPaneClick={() => {
          setSelectedTableId(null);
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
  const showDeploymentSelect =
    state.deployments.length > 0 && (state.deployments.length > 1 || !selectedDeployment);

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
          {showDeploymentSelect ? (
            <Select value={selectedDeploymentId} onValueChange={handleDeploymentValueChange}>
              <SelectTrigger className="h-8 min-w-44 max-w-60 text-xs">
                <SelectValue placeholder="Select deployment" />
              </SelectTrigger>
              <AppSelectContent>
                {state.deployments.map((deployment) => (
                  <AppSelectItem key={deployment._id} value={deployment._id}>
                    {deployment.rootDirectory === "/"
                      ? deployment.deploymentName
                      : `${deployment.rootDirectory}: ${deployment.deploymentName}`}
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
  const showDeploymentSelect =
    state !== null &&
    state !== undefined &&
    state.deployments.length > 0 &&
    (state.deployments.length > 1 || !selectedDeployment);
  const zoneSummaries = useMemo(
    () =>
      snapshot ? buildSchemaZoneSummaries(snapshot.graph.tables, snapshot.graph.relationships) : [],
    [snapshot],
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
            {showDeploymentSelect ? (
              <Select value={selectedDeploymentId} onValueChange={handleDeploymentValueChange}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue placeholder="Select deployment" />
                </SelectTrigger>
                <AppSelectContent>
                  {state.deployments.map((deployment) => (
                    <AppSelectItem key={deployment._id} value={deployment._id}>
                      {deployment.rootDirectory === "/"
                        ? deployment.deploymentName
                        : `${deployment.rootDirectory}: ${deployment.deploymentName}`}
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
              <span className="min-w-0 truncate font-mono text-foreground">
                {selectedDeployment?.rootDirectory ?? "Unknown"}
              </span>
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

          {zoneSummaries.length > 0 ? (
            <div className="grid gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <span>Zones</span>
              <div className="grid gap-2">
                {zoneSummaries.map((summary) => (
                  <div key={summary.zone.id} className="grid gap-0.5">
                    <div className="flex min-w-0 justify-between gap-2">
                      <span className="min-w-0 text-foreground">{summary.zone.label}</span>
                      <span className="shrink-0 font-mono text-foreground">
                        {formatCount(summary.tableCount)}
                      </span>
                    </div>
                    <div className="font-mono text-[11px]">
                      {formatCount(summary.relationshipCount)} internal /{" "}
                      {formatCount(summary.crossZoneRelationshipCount)} cross-zone
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

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
  deploymentId,
  vaultId,
}: {
  deploymentId?: string;
  vaultId: Id<"vaults">;
}): VaultConvexSchemaGraphController {
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | undefined>(
    deploymentId,
  );
  const [refreshPending, setRefreshPending] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const queryArgs = useMemo(
    () => (selectedDeploymentId ? { vaultId, deploymentId: selectedDeploymentId } : { vaultId }),
    [selectedDeploymentId, vaultId],
  );
  const state = useQuery(api.vault.convexSchemaGraph.get, queryArgs);
  const refresh = useAction(api.vault.convexSchemaGraph.refresh);
  const saveLayout = useMutation(api.vault.convexSchemaGraph.saveLayout);

  useEffect(() => {
    setSelectedDeploymentId(deploymentId);
  }, [deploymentId, vaultId]);

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
  deploymentId,
  vaultId,
  variant = "dashboard",
}: {
  deploymentId?: string;
  vaultId: Id<"vaults">;
  variant?: VaultConvexSchemaGraphVariant;
}) {
  const controller = useVaultConvexSchemaGraphController({ deploymentId, vaultId });
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
      rightToggleVisibility="all"
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
    deploymentId: context.deploymentId,
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
