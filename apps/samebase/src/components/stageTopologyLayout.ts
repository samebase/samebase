import type { TopologyEdge, TopologyNode } from "./stageTopology";

type Positions = Map<string, { x: number; y: number }>;
type Band = { ids: string[]; step: number };

// Coordinates are for the top left of each 184 × 108 node. The gaps leave room for edge labels.
const columnStep = 224;
const rowStep = 144;

function placeBands(positions: Positions, bands: Band[], axis: "x" | "y", gap: number) {
  const span = bands.reduce((max, { ids, step }) => Math.max(max, (ids.length - 1) * step), 0);
  bands.forEach(({ ids, step }, band) => {
    const start = (span - (ids.length - 1) * step) / 2;
    ids.forEach((id, index) => {
      const along = start + index * step;
      positions.set(id, axis === "x" ? { x: band * gap, y: along } : { x: along, y: band * gap });
    });
  });
}

function placeBindings(
  positions: Positions,
  nodes: TopologyNode[],
  edges: readonly TopologyEdge[],
  narrow: boolean,
) {
  const workers = nodes.filter((node) => node.kind === "worker");
  const workerIndex = new Map(workers.map((node, index) => [node.id, index]));
  const owners = new Map<string, number>();
  for (const edge of edges) {
    const owner = workerIndex.get(edge.source);
    if (owner !== undefined)
      owners.set(edge.target, Math.min(owners.get(edge.target) ?? owner, owner));
  }

  // The first Worker that uses a shared target gives it a position. All its edges still end there.
  const targets = workers.map((): string[] => []);
  for (const node of nodes) {
    if (!workerIndex.has(node.id)) targets[owners.get(node.id) ?? 0].push(node.id);
  }

  if (narrow) {
    const compactRow = 120;
    let top = 0;
    workers.forEach((worker, index) => {
      const group = targets[index];
      const span = Math.max(0, group.length - 1) * compactRow;
      positions.set(worker.id, { x: 0, y: top + span / 2 });
      group.forEach((id, row) => positions.set(id, { x: 230, y: top + row * compactRow }));
      top += span + compactRow + 20;
    });
    return;
  }

  const above: string[] = [],
    below: string[] = [];
  targets.forEach((group, index) => {
    (index % 2 === 0 ? above : below).push(...group);
  });
  placeBands(
    positions,
    [
      { ids: above, step: columnStep },
      { ids: workers.map((node) => node.id), step: 324 },
      { ids: below, step: columnStep },
    ].filter((band) => band.ids.length > 0),
    "y",
    202,
  );
}

/** Place a resource after its inputs. A recorded cycle gets one deterministic backwards edge or more. */
function placeDependencies(
  positions: Positions,
  nodes: TopologyNode[],
  edges: readonly TopologyEdge[],
) {
  const remaining = new Set(nodes.map((node) => node.id));
  const outputs = new Map<string, Set<string>>();
  const inputs = new Map<string, number>();
  for (const { source, target } of edges) {
    if (source === target || !remaining.has(source) || !remaining.has(target)) continue;
    const consumers = outputs.get(source) ?? new Set<string>();
    if (consumers.has(target)) continue;
    consumers.add(target);
    outputs.set(source, consumers);
    inputs.set(target, (inputs.get(target) ?? 0) + 1);
  }

  const bands: Band[] = [];
  let ready = [...remaining].filter((id) => !inputs.has(id));
  while (remaining.size > 0) {
    if (ready.length === 0) {
      const first = remaining.values().next();
      if (first.done) break;
      ready = [first.value];
    }
    bands.push({ ids: ready, step: rowStep });
    for (const id of ready) remaining.delete(id);
    const next: string[] = [];
    for (const id of ready) {
      for (const consumer of outputs.get(id) ?? []) {
        const count = (inputs.get(consumer) ?? 0) - 1;
        inputs.set(consumer, count);
        if (count === 0 && remaining.has(consumer)) next.push(consumer);
      }
    }
    ready = next.sort();
  }
  placeBands(positions, bands, "x", 308);
}

export function layoutStageTopology(
  nodes: readonly TopologyNode[],
  edges: readonly TopologyEdge[],
  layer: "bindings" | "dependencies",
  narrow = false,
): Positions {
  const positions: Positions = new Map();
  const ordered = [...nodes].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const endpoints = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const linked = ordered.filter((node) => endpoints.has(node.id));
  if (layer === "bindings" && linked.some((node) => node.kind === "worker")) {
    placeBindings(positions, linked, edges, narrow);
  } else {
    placeDependencies(positions, linked, edges);
  }

  const detached = ordered.filter((node) => !endpoints.has(node.id));
  const extent = [...positions.values()].reduce(
    (box, point) => ({
      width: Math.max(box.width, point.x + 184),
      bottom: Math.max(box.bottom, point.y + 108),
    }),
    { width: 0, bottom: 0 },
  );
  const columns = narrow
    ? 2
    : Math.max(2, Math.ceil(extent.width / columnStep), Math.ceil(Math.sqrt(detached.length)));
  detached.forEach((node, index) => {
    positions.set(node.id, {
      x: (index % columns) * columnStep,
      y: (extent.bottom ? extent.bottom + 54 : 0) + Math.floor(index / columns) * rowStep,
    });
  });
  return positions;
}
