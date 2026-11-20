import { notEmpty } from "@samebase/dependent";
import { resourceTypeUI, type IconNode, type ResourceCategory } from "@samebase/alchemy-kit/ui";
import { validate } from "convex-helpers/validators";
import { v } from "convex/values";
import { asRecord, readString } from "../../convex/jsonUtils";
import { namespaceOf } from "../../shared/alchemyState";
import type { AlchemyStage } from "../../shared/alchemyStateModel";

const { array, object, string } = v;

/**
The fields of an Alchemy state row that the diagram reads. `downstream` lists the fqns of the rows
that depend on this row. `attr`, `bindings` and `namespace` are read field by field, because their
shape depends on the resource type.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/State/ResourceState.ts
*/
const vDiagramRow = object({
  logicalId: string(),
  resourceType: string(),
  status: string(),
  downstream: array(string()),
});

/** Categories of the resources that get a box. Each other row folds into a box or a line. */
const BOX_CATEGORIES = new Set<ResourceCategory>([
  "compute",
  "storage",
  "database",
  "queue",
  "email",
  "ai",
  "media",
  "cdn",
]);

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function readRow({ fqn, value }: AlchemyStage["resources"][number]) {
  const state: unknown = JSON.parse(value);
  if (!validate(vDiagramRow, state, { allowUnknownFields: true })) {
    return [];
  }
  const record = asRecord(state);
  const attr = asRecord(record["attr"]);
  return [
    {
      fqn,
      logicalId: state.logicalId,
      resourceType: state.resourceType,
      status: state.status,
      downstream: state.downstream,
      namespace: namespaceOf(record["namespace"]),
      attr,
      /**
      A Worker keeps each binding as `{ sid, data: { bindings: [...] } }`, and an R2 binding names its
      bucket in `bucketName`. Only these identifiers are read: plain text and secret bindings hold
      their values next to them.
      */
      bindings: list(record["bindings"]).flatMap((value) => {
        const group = asRecord(value);
        const sid = readString(group, "sid");
        if (sid === undefined) {
          return [];
        }
        const bucketNames = list(asRecord(group["data"])["bindings"])
          .map(asRecord)
          .filter((binding) => readString(binding, "type") === "r2_bucket")
          .map((binding) => readString(binding, "bucketName"))
          .filter(notEmpty);
        return [{ sid, bucketNames }];
      }),
      /** A Convex deployment's `siteUrl` (the app) and `url`, and a Worker's `url` and `urls`. */
      urls: [
        ...new Set(
          [attr["siteUrl"], attr["url"], ...list(attr["urls"])]
            .filter((url) => typeof url === "string")
            .filter((url) => URL.canParse(url) && /^https?:\/\//.test(url)),
        ),
      ],
      /** The URL that a box shows: the app of a Convex deployment, the URL of a Worker. */
      link:
        state.resourceType === "Convex.Deployment"
          ? readString(attr, "siteUrl")
          : state.resourceType === "Cloudflare.Worker"
            ? readString(attr, "url")
            : undefined,
    },
  ];
}

export type DiagramRow = ReturnType<typeof readRow>[number];

export type DiagramBox = {
  /** The fqn of the first row. */
  id: string;
  name: string;
  typeName: string;
  /** The resource type of the first row. */
  resourceType: string;
  category: ResourceCategory;
  icon: IconNode;
  /** A Convex deployment, drawn as three slabs. */
  convex: boolean;
  rows: DiagramRow[];
  /** The rows without a box of their own that attach to this box. */
  folded: DiagramRow[];
  link: string | null;
  urls: string[];
  namespace: string[];
};

/** A line between the boxes at indexes `a` and `b`. `from` is the box that depends on the other. */
export type DiagramEdge = { a: number; b: number; from: number | null; labels: string[] };

const categoryOf = (type: string) =>
  type === "Convex.Deployment" ? "compute" : resourceTypeUI(type).category;

const commonPrefix = (paths: string[][]) =>
  paths.reduce((prefix, path) => {
    let index = 0;
    while (index < prefix.length && index < path.length && prefix[index] === path[index]) {
      index++;
    }
    return prefix.slice(0, index);
  });

/**
The boxes and lines of a stage. A box is a main resource (see `BOX_CATEGORIES`); Convex deployments
with the same `attr.url` are one box, and the Cloudflare Email rows of the stage are one "Email"
box. Every other row folds into the box it connects to through `downstream`, in either direction,
also through other folded rows. A folded row that connects two or more boxes is a label on the lines
between them instead. A `Convex.Project` folds into the first deployment it creates.
*/
export function stageDiagram(resources: AlchemyStage["resources"]) {
  const rows = resources.flatMap(readRow);
  const upstream = new Map<string, string[]>(rows.map((row) => [row.fqn, []]));
  for (const row of rows) {
    for (const fqn of row.downstream) {
      upstream.get(fqn)?.push(row.fqn);
    }
  }
  const neighbours = (row: DiagramRow) => [...row.downstream, ...(upstream.get(row.fqn) ?? [])];

  const boxes = boxGroups(rows).map(({ email, rows: members }): DiagramBox => {
    const [first] = members;
    const ui = resourceTypeUI(first.resourceType);
    return {
      id: first.fqn,
      name: email ? "Email" : members.map((row) => row.logicalId).join(", "),
      typeName: email ? "Cloudflare Email" : ui.name,
      resourceType: first.resourceType,
      category: email ? "email" : categoryOf(first.resourceType),
      // The envelope of Email Routing stands for the whole group.
      icon: email ? resourceTypeUI("Cloudflare.Email.Routing").icon : ui.icon,
      convex: first.resourceType === "Convex.Deployment",
      rows: members,
      folded: email ? [...members] : [],
      link: members.map((row) => row.link).find(notEmpty) ?? null,
      urls: [...new Set(members.flatMap((row) => row.urls))],
      namespace: commonPrefix(members.map((row) => row.namespace)),
    };
  });
  const boxOf = new Map<string, number>(
    boxes.flatMap((box, index) => box.rows.map((row) => [row.fqn, index] as const)),
  );
  const { home, labelRows } = foldRows(
    rows.filter((row) => !boxOf.has(row.fqn)),
    boxOf,
    neighbours,
  );
  for (const row of rows) {
    const box = home.get(row.fqn);
    if (box !== undefined) {
      boxes[box].folded.push(row);
    }
  }

  const edges: DiagramEdge[] = [];
  const edgeFor = (a: number, b: number) =>
    edges.find((edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a));
  boxes.forEach((box, index) => {
    for (const row of box.rows) {
      for (const fqn of row.downstream) {
        const user = boxOf.get(fqn) ?? home.get(fqn);
        if (user === undefined || user === index || edgeFor(user, index)) {
          continue;
        }
        edges.push({ a: user, b: index, from: user, labels: [] });
      }
    }
  });
  for (const edge of edges) {
    edge.labels.push(
      ...new Set([
        ...bindingNames(boxes[edge.a], boxes[edge.b]),
        ...bindingNames(boxes[edge.b], boxes[edge.a]),
      ]),
    );
  }
  for (const { row, reach } of labelRows) {
    const text = row.resourceType === "Alchemy.Random" ? "shared secret" : row.logicalId;
    reach.forEach((a, i) => {
      for (const b of reach.slice(i + 1)) {
        const edge = edgeFor(a, b);
        if (edge) {
          edge.labels.push(text);
        } else {
          edges.push({ a, b, from: null, labels: [text] });
        }
      }
    });
  }

  return { boxes, edges, urls: new Set(rows.flatMap((row) => row.urls)) };
}

/** The Worker binding names of `worker` that name a row of `other`, by logical id or R2 bucket. */
function bindingNames(worker: DiagramBox, other: DiagramBox) {
  return worker.rows
    .filter((row) => row.resourceType === "Cloudflare.Worker")
    .flatMap((row) => row.bindings)
    .filter(({ sid, bucketNames }) =>
      other.rows.some((target) => {
        const bucket = readString(target.attr, "bucketName");
        return (
          target.logicalId.toLowerCase() === sid.toLowerCase() ||
          (bucket !== undefined && bucketNames.includes(bucket))
        );
      }),
    )
    .map(({ sid }) => sid);
}

/**
The rows that get a box, as groups that share one box, in row order: the Cloudflare Email rows, and
Convex deployments with the same `attr.url`.
*/
function boxGroups(rows: DiagramRow[]) {
  const groups: { email: boolean; rows: DiagramRow[] }[] = [];
  for (const row of rows) {
    if (row.resourceType === "Convex.Project") {
      continue;
    }
    if (row.resourceType.startsWith("Cloudflare.Email.")) {
      const email = groups.find((group) => group.email);
      if (email) {
        email.rows.push(row);
      } else {
        groups.push({ email: true, rows: [row] });
      }
      continue;
    }
    if (!BOX_CATEGORIES.has(categoryOf(row.resourceType))) {
      continue;
    }
    const url = readString(row.attr, "url");
    const same =
      row.resourceType === "Convex.Deployment" && url
        ? groups.find((group) =>
            group.rows.some(
              (other) =>
                other.resourceType === "Convex.Deployment" && readString(other.attr, "url") === url,
            ),
          )
        : undefined;
    if (same) {
      same.rows.push(row);
    } else {
      groups.push({ email: false, rows: [row] });
    }
  }
  return groups;
}

/**
The box index that each folded row attaches to (`home`, by fqn), and the folded rows that connect
two or more boxes (`labelRows`), which attach to none.
*/
function foldRows(
  folded: DiagramRow[],
  boxOf: Map<string, number>,
  neighbours: (row: DiagramRow) => string[],
) {
  const direct = (row: DiagramRow) => [
    ...new Set(
      neighbours(row)
        .map((fqn) => boxOf.get(fqn))
        .filter(notEmpty),
    ),
  ];
  const home = new Map<string, number>();
  for (const row of folded) {
    const reached =
      row.resourceType === "Convex.Project"
        ? row.downstream
            .map((fqn) => boxOf.get(fqn))
            .filter(notEmpty)
            .slice(0, 1)
        : direct(row);
    if (reached.length === 1) {
      home.set(row.fqn, reached[0]);
    }
  }
  // A row that reaches no box attaches through the folded rows next to it.
  for (let changed = true; changed;) {
    changed = false;
    for (const row of folded) {
      if (home.has(row.fqn) || direct(row).length > 0) {
        continue;
      }
      const via = [
        ...new Set(
          neighbours(row)
            .map((fqn) => home.get(fqn))
            .filter(notEmpty),
        ),
      ];
      if (via.length === 1) {
        home.set(row.fqn, via[0]);
        changed = true;
      }
    }
  }
  const labelRows: { row: DiagramRow; reach: number[] }[] = [];
  for (const row of folded) {
    if (row.resourceType === "Convex.Project") {
      continue;
    }
    const reach = [
      ...new Set([
        ...direct(row),
        ...row.downstream
          .filter((fqn) => !boxOf.has(fqn))
          .map((fqn) => home.get(fqn))
          .filter(notEmpty),
      ]),
    ];
    if (reach.length >= 2) {
      home.delete(row.fqn);
      labelRows.push({ row, reach });
    } else if (reach.length === 1) {
      home.set(row.fqn, reach[0]);
    }
  }
  return { home, labelRows };
}

export type StageDiagram = ReturnType<typeof stageDiagram>;

export const BOX_WIDTH = 248;

/** Border and padding, the icon row, the link row, and the "N more" row of a box, in pixels. */
const boxHeight = (box: DiagramBox) => 72 + (box.link ? 24 : 0) + (box.folded.length > 0 ? 20 : 0);

/** A label is 11px monospace text: about 6.7px for each character and 14px for each line. */
const labelSize = (edge: DiagramEdge | undefined) =>
  edge && edge.labels.length > 0
    ? {
        w: Math.max(...edge.labels.map((label) => label.length)) * 6.7 + 8,
        h: edge.labels.length * 14 + 2,
      }
    : { w: 0, h: 0 };

/**
Layers from the left: the boxes with a URL first, then each box one layer right of its nearest
box with a URL. A part of the graph that no URL reaches starts in the next layer at its box with the
most lines.
*/
function layers(boxCount: number, edges: DiagramEdge[], entries: number[]) {
  const adjacent: number[][] = Array.from({ length: boxCount }, () => []);
  for (const { a, b } of edges) {
    adjacent[a].push(b);
    adjacent[b].push(a);
  }
  const layer: number[] = Array.from({ length: boxCount }, () => -1);
  const spread = (start: number[], first: number) => {
    const queue = [...start];
    for (const box of start) {
      layer[box] = first;
    }
    for (let box = queue.shift(); box !== undefined; box = queue.shift()) {
      for (const next of adjacent[box]) {
        if (layer[next] === -1) {
          layer[next] = layer[box] + 1;
          queue.push(next);
        }
      }
    }
  };
  spread(entries, 0);
  const base = entries.length > 0 ? 1 : 0;
  for (
    let rest = layer.flatMap((value, box) => (value === -1 ? [box] : []));
    rest.length > 0;
    rest = layer.flatMap((value, box) => (value === -1 ? [box] : []))
  ) {
    rest.sort((x, y) => adjacent[y].length - adjacent[x].length);
    spread([rest[0]], base);
  }
  return { layer, adjacent };
}

export type BoxPosition = { x: number; y: number; w: number; h: number; layer: number };

/**
Positions in pixels: layers are columns from left to right, and the boxes of each namespace are a
band of rows, framed when the stage has namespaces. Lines are curves between columns, straight
between neighbours in a column, and brackets on the left between other boxes of a column.
*/
export function layoutDiagram({ boxes, edges }: StageDiagram) {
  const entries = boxes.flatMap((box, index) => (box.urls.length > 0 ? [index] : []));
  const { layer, adjacent } = layers(boxes.length, edges, entries);
  const layerCount = Math.max(...layer) + 1;
  const bandOf = (box: number) => boxes[box].namespace.join("/");
  const bands = [...new Set(boxes.map((_, index) => bandOf(index)))].sort(
    (x, y) => Number(x === "") - Number(y === ""),
  );
  const framed = bands.some((band) => band !== "");

  const order = rowOrder(layer, adjacent, layerCount, bands, bandOf);

  const gapBetween = (x: number, y: number) => {
    const edge = edges.find((e) => (e.a === x && e.b === y) || (e.a === y && e.b === x));
    if (!edge) {
      return 24;
    }
    return edge.labels.length > 0 ? labelSize(edge).h + 40 : 40;
  };
  return placeBoxes({
    boxes,
    edges,
    layer,
    adjacent,
    layerCount,
    bands,
    bandOf,
    framed,
    order,
    gapBetween,
    heightOf: (box) => boxHeight(boxes[box]),
  });
}

/**
The row of each box in its column, counted across the bands: the first column keeps neighbours next
to each other, and each later column sorts its boxes by the average row of their neighbours in
earlier columns.
*/
function rowOrder(
  layer: number[],
  adjacent: number[][],
  layerCount: number,
  bands: string[],
  bandOf: (box: number) => string,
) {
  const order: number[] = [];
  for (let L = 0; L < layerCount; L++) {
    let next = 0;
    for (const band of bands) {
      const here = layer.flatMap((value, box) =>
        value === L && bandOf(box) === band ? [box] : [],
      );
      let sorted: number[] = [];
      if (L === 0) {
        // Neighbours next to each other.
        const left = [...here];
        while (left.length > 0) {
          const last = sorted.at(-1);
          const near = last === undefined ? -1 : left.findIndex((b) => adjacent[last].includes(b));
          sorted.push(...left.splice(Math.max(near, 0), 1));
        }
      } else {
        // Below the average row of the neighbours in earlier columns.
        const centre = (box: number) => {
          const earlier = adjacent[box].filter((n) => layer[n] < L);
          return earlier.length > 0
            ? earlier.reduce((sum, n) => sum + order[n], 0) / earlier.length
            : 1e9 + box;
        };
        sorted = [...here].sort((x, y) => centre(x) - centre(y));
      }
      for (const box of sorted) {
        order[box] = next++;
      }
    }
  }
  return order;
}

function placeBoxes({
  boxes,
  edges,
  layer,
  adjacent,
  layerCount,
  bands,
  bandOf,
  framed,
  order,
  gapBetween,
  heightOf,
}: {
  boxes: DiagramBox[];
  edges: DiagramEdge[];
  layer: number[];
  adjacent: number[][];
  layerCount: number;
  bands: string[];
  bandOf: (box: number) => string;
  framed: boolean;
  order: number[];
  gapBetween: (x: number, y: number) => number;
  heightOf: (box: number) => number;
}) {
  // The card around the diagram gives the outer spacing, so the first column starts at the edge.
  const layerX = [framed ? 16 : 0];
  for (let L = 1; L < layerCount; L++) {
    const between = edges.filter(
      (e) => Math.min(layer[e.a], layer[e.b]) === L - 1 && Math.max(layer[e.a], layer[e.b]) === L,
    );
    const widest = Math.max(0, ...between.map((edge) => labelSize(edge).w));
    layerX.push(layerX[L - 1] + BOX_WIDTH + Math.max(96, widest + 56) + (framed ? 32 : 0));
  }

  const positions = new Map<number, BoxPosition>();
  const frames: { name: string; x: number; y: number; w: number; h: number; members: number[] }[] =
    [];
  let cursor = 0;
  let previousBand: number[] = [];
  for (const band of bands) {
    const members = boxes.flatMap((_, box) => (bandOf(box) === band ? [box] : []));
    let bandGap = 0;
    if (previousBand.length > 0) {
      bandGap = 24;
      for (let L = 0; L < layerCount; L++) {
        const up = previousBand
          .filter((box) => layer[box] === L)
          .sort((x, y) => order[y] - order[x])
          .at(0);
        const down = members
          .filter((box) => layer[box] === L)
          .sort((x, y) => order[x] - order[y])
          .at(0);
        if (up !== undefined && down !== undefined) {
          bandGap = Math.max(bandGap, gapBetween(up, down));
        }
      }
    }
    const top = cursor + bandGap + (band ? 34 : 0);
    let bottom = top;
    for (let L = 0; L < layerCount; L++) {
      const here = members.filter((box) => layer[box] === L).sort((x, y) => order[x] - order[y]);
      let previous: BoxPosition | undefined;
      let previousBox = -1;
      for (const box of here) {
        const h = heightOf(box);
        let y = previous ? previous.y + previous.h + gapBetween(previousBox, box) : top;
        const placed = adjacent[box]
          .filter((n) => layer[n] < L)
          .map((n) => positions.get(n))
          .filter(notEmpty);
        if (placed.length > 0) {
          y = Math.max(
            y,
            placed.reduce((sum, p) => sum + p.y + p.h / 2, 0) / placed.length - h / 2,
          );
        }
        previous = { x: layerX[L], y, w: BOX_WIDTH, h, layer: L };
        previousBox = box;
        positions.set(box, previous);
        bottom = Math.max(bottom, y + h);
      }
    }
    if (band) {
      const placed = members.map((box) => positions.get(box)).filter(notEmpty);
      const x0 = Math.min(...placed.map((p) => p.x)) - 16;
      const x1 = Math.max(...placed.map((p) => p.x + p.w)) + 16;
      frames.push({
        name: band,
        x: x0,
        y: top - 34,
        w: x1 - x0,
        h: bottom + 16 - (top - 34),
        members,
      });
      bottom += 16;
    }
    cursor = bottom;
    previousBand = members;
  }

  const nodes = boxes.flatMap((box, index) => {
    const position = positions.get(index);
    return position ? [{ box, position }] : [];
  });
  const width =
    Math.max(
      ...nodes.map(({ position }) => position.x + position.w),
      ...frames.map((frame) => frame.x + frame.w),
    ) + 1;

  return { nodes, frames, lines: routeLines(edges, positions, frames), width, height: cursor + 1 };
}

type Point = { x: number; y: number };

/** The tip and the two back corners of an arrow head at `tip`, pointing in direction `dx`, `dy`. */
const arrowHead = (tip: Point, dx: number, dy: number) =>
  [
    [tip.x, tip.y],
    [tip.x - 7 * dx - 3.5 * dy, tip.y - 7 * dy + 3.5 * dx],
    [tip.x - 7 * dx + 3.5 * dy, tip.y - 7 * dy - 3.5 * dx],
  ]
    .map((point) => point.join(","))
    .join(" ");

function routeLines(
  edges: DiagramEdge[],
  positions: Map<number, BoxPosition>,
  frames: { y: number; h: number; members: number[] }[],
) {
  const centreY = (p: BoxPosition) => p.y + p.h / 2;
  // Each box has a position, so every edge has a route.
  const routes = edges.flatMap(
    (
      edge,
    ): {
      edge: DiagramEdge;
      kind: "curve" | "straight" | "bracket";
      start: number;
      end: number;
      ps: BoxPosition;
      pe: BoxPosition;
    }[] => {
      const pa = positions.get(edge.a);
      const pb = positions.get(edge.b);
      if (!pa || !pb) {
        return [];
      }
      if (pa.layer !== pb.layer) {
        return [
          pa.layer < pb.layer
            ? { edge, kind: "curve", start: edge.a, end: edge.b, ps: pa, pe: pb }
            : { edge, kind: "curve", start: edge.b, end: edge.a, ps: pb, pe: pa },
        ];
      }
      const [u, d, pu, pd] =
        pa.y < pb.y ? ([edge.a, edge.b, pa, pb] as const) : ([edge.b, edge.a, pb, pa] as const);
      const between = [...positions].some(
        ([box, p]) => box !== u && box !== d && p.layer === pa.layer && p.y > pu.y && p.y < pd.y,
      );
      return [{ edge, kind: between ? "bracket" : "straight", start: u, end: d, ps: pu, pe: pd }];
    },
  );

  // Lines that meet one side of a box spread 12px apart, in the order of their other ends.
  const anchorY = (box: number, p: BoxPosition, side: "left" | "right", edge: DiagramEdge) => {
    const meeting = routes
      .flatMap((route) => {
        if (route.kind === "curve") {
          if (route.start === box && side === "right") return [{ route, other: route.pe }];
          if (route.end === box && side === "left") return [{ route, other: route.ps }];
          return [];
        }
        if (route.kind === "bracket" && side === "left") {
          if (route.start === box) return [{ route, other: route.pe }];
          if (route.end === box) return [{ route, other: route.ps }];
        }
        return [];
      })
      .sort((x, y) => centreY(x.other) - centreY(y.other));
    const index = meeting.findIndex(({ route }) => route.edge === edge);
    return centreY(p) + (index - (meeting.length - 1) / 2) * 12;
  };

  let bracketCount = 0;
  return routes.map(({ edge, kind, start, end, ps, pe }) => {
    let d: string;
    let label: Point;
    let startTip: { tip: Point; dx: number; dy: number };
    let endTip: { tip: Point; dx: number; dy: number };
    if (kind === "curve") {
      const x1 = ps.x + ps.w;
      const y1 = anchorY(start, ps, "right", edge);
      const x2 = pe.x;
      const y2 = anchorY(end, pe, "left", edge);
      const dx = (x2 - x1) / 2;
      d = `M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
      label = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
      startTip = { tip: { x: x1, y: y1 }, dx: -1, dy: 0 };
      endTip = { tip: { x: x2, y: y2 }, dx: 1, dy: 0 };
    } else if (kind === "straight") {
      const x = ps.x + ps.w / 2;
      const y1 = ps.y + ps.h;
      const y2 = pe.y;
      d = `M${x} ${y1}V${y2}`;
      const frameOf = (box: number) => frames.find((frame) => frame.members.includes(box));
      const fs = frameOf(start);
      const fe = frameOf(end);
      const top = fs !== fe && fs ? fs.y + fs.h : y1;
      const bottom = fs !== fe && fe ? fe.y : y2;
      label = { x, y: (top + bottom) / 2 };
      startTip = { tip: { x, y: y1 }, dx: 0, dy: -1 };
      endTip = { tip: { x, y: y2 }, dx: 0, dy: 1 };
    } else {
      const x1 = ps.x;
      const y1 = anchorY(start, ps, "left", edge);
      const y2 = anchorY(end, pe, "left", edge);
      const bx = x1 - 18 - 10 * bracketCount++;
      d = `M${x1} ${y1}H${bx}V${y2}H${x1}`;
      label = { x: bx, y: (y1 + y2) / 2 };
      startTip = { tip: { x: x1, y: y1 }, dx: 1, dy: 0 };
      endTip = { tip: { x: x1, y: y2 }, dx: 1, dy: 0 };
    }
    // The arrow points at the box that the other box depends on.
    const tip = edge.from === null ? null : edge.from === start ? endTip : startTip;
    return {
      key: `${edge.a}-${edge.b}`,
      d,
      arrow: tip ? arrowHead(tip.tip, tip.dx, tip.dy) : null,
      labels: edge.labels,
      label,
    };
  });
}
