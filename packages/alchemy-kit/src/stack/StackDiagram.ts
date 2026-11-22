import * as Schema from "effect/Schema";
import { resourceTypeUI, type IconNode, type ResourceCategory } from "../ui/ResourceTypeUI.ts";
import { asRecord, list, readString } from "./json.ts";
import { resourceDashboard, resourceFacts } from "./ResourceFacts.ts";
import { TARGET_IDS, workerBindings, type WorkerBinding } from "./WorkerBindings.ts";

export { cronInWords, type ResourceFact } from "./ResourceFacts.ts";

/** A row of a stage as the state store holds it: its fqn and its state, parsed from JSON. */
export interface StateRow {
  readonly fqn: string;
  readonly state: unknown;
}

/**
The fields of an Alchemy state row that every row has. `downstream` lists the fqns of the rows that
depend on this row. `attr`, `props`, `bindings` and `namespace` are read field by field, because
their shape depends on the resource type.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.87/packages/alchemy/src/State/ResourceState.ts
*/
const isStateRow = Schema.is(
  Schema.Struct({
    logicalId: Schema.String,
    resourceType: Schema.String,
    status: Schema.String,
    downstream: Schema.Array(Schema.String),
  }),
);

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

/**
The namespace ids of a state row from the stack root. Alchemy writes the namespace of a row as a
chain from the innermost id, such as `{ "Id": "Inbox", "Parent": { "Id": "Mail/Shared" } }` for
`["Mail/Shared", "Inbox"]`, and a row at the stack root has no `namespace`.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.87/packages/alchemy/src/Namespace.ts
*/
export function namespaceOf(node: unknown): string[] {
  const record = asRecord(node);
  const id = readString(record, "Id");
  return id === undefined ? [] : [...namespaceOf(record["Parent"]), id];
}

/**
What the diagram shows of a row. Alchemy state holds secrets in clear text, such as the value of an
`Alchemy.Random` or a plain text binding, so a row keeps only these fields and never its whole
`attr` or `props`.
*/
function readRow({ fqn, state }: StateRow) {
  if (!isStateRow(state)) {
    return [];
  }
  const { logicalId, resourceType, status, downstream } = state;
  const record = asRecord(state);
  const attr = asRecord(record["attr"]);
  return [
    {
      fqn,
      logicalId,
      resourceType,
      status,
      downstream,
      namespace: namespaceOf(record["namespace"]),
      facts: resourceFacts(resourceType, { attr, props: asRecord(record["props"]) }),
      dashboard: resourceDashboard(resourceType, attr) ?? null,
      bindings: workerBindings(record["bindings"]),
      /** The identifiers that a Worker binding names this row by, such as its bucket. */
      ids: TARGET_IDS.flatMap((field) => readString(attr, field) ?? []),
      /** The `.convex.cloud` URL of a Convex deployment: rows with the same URL are one deployment. */
      deploymentUrl:
        resourceType === "Convex.Deployment" ? (readString(attr, "url") ?? null) : null,
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
        (resourceType === "Convex.Deployment"
          ? readString(attr, "siteUrl")
          : resourceType === "Cloudflare.Worker"
            ? readString(attr, "url")
            : undefined) ?? null,
    },
  ];
}

export type DiagramRow = ReturnType<typeof readRow>[number];

export interface DiagramBox {
  /** The fqn of the first row. */
  id: string;
  name: string;
  typeName: string;
  /** The resource type of the first row. */
  resourceType: string;
  category: ResourceCategory;
  icon: IconNode;
  rows: [DiagramRow, ...DiagramRow[]];
  /** The rows without a box of their own that attach to this box. */
  folded: DiagramRow[];
  link: string | null;
  urls: string[];
  namespace: string[];
  /** The resource bindings of the box's Workers, by kind, then name. */
  bindings: BoxBinding[];
}

/** A Worker binding of a box, with the other box that it names, if one does. */
export interface BoxBinding extends Omit<WorkerBinding, "ids"> {
  box: DiagramBox | null;
}

/** A line between the boxes `a` and `b`. `from` is the box that depends on the other, if one does. */
export interface DiagramLine {
  a: DiagramBox;
  b: DiagramBox;
  from: DiagramBox | null;
  labels: string[];
}

const categoryOf = (type: string) =>
  type === "Convex.Deployment" ? "compute" : resourceTypeUI(type).category;

const commonPrefix = ([first, ...rest]: [string[], ...string[][]]) =>
  rest.reduce((prefix, path) => {
    let index = 0;
    while (index < prefix.length && index < path.length && prefix[index] === path[index]) {
      index++;
    }
    return prefix.slice(0, index);
  }, first);

/**
The boxes and lines of a stage, from its state rows. A box is a main resource (see
`BOX_CATEGORIES`); Convex deployments with the same `attr.url` are one box, and the Cloudflare Email
rows of the stage are one "Email" box. Every other row folds into the box it connects to through
`downstream`, in either direction, also through other folded rows. A folded row that connects two or
more boxes is a label on the lines between them instead. A `Convex.Project` folds into the first
deployment it creates. A line also carries the Worker binding names that name the other box.

`urls` are the URLs of every row of the stage.
*/
export function stageDiagram(stateRows: readonly StateRow[]) {
  const rows = stateRows.flatMap(readRow);
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
      rows: members,
      folded: email ? [...members] : [],
      link: members.map((row) => row.link).find((link) => link !== null) ?? null,
      urls: [...new Set(members.flatMap((row) => row.urls))],
      namespace: commonPrefix([first.namespace, ...members.slice(1).map((row) => row.namespace)]),
      bindings: [],
    };
  });
  for (const box of boxes) {
    box.bindings = boxBindings(box, boxes);
  }
  const boxOf = new Map(boxes.flatMap((box) => box.rows.map((row) => [row.fqn, box] as const)));
  const { home, labelRows } = foldRows(
    rows.filter((row) => !boxOf.has(row.fqn)),
    boxOf,
    neighbours,
  );
  for (const row of rows) {
    home.get(row.fqn)?.folded.push(row);
  }

  const lines: DiagramLine[] = [];
  const lineFor = (a: DiagramBox, b: DiagramBox) =>
    lines.find((line) => (line.a === a && line.b === b) || (line.a === b && line.b === a));
  const uses = [
    ...boxes.flatMap((box) =>
      box.rows.flatMap((row) =>
        row.downstream.map((fqn) => [boxOf.get(fqn) ?? home.get(fqn), box] as const),
      ),
    ),
    // A binding to a box that `downstream` does not connect still uses it.
    ...boxes.flatMap((box) =>
      box.bindings.map((binding) => [box, binding.box ?? undefined] as const),
    ),
  ];
  for (const [user, used] of uses) {
    if (user !== undefined && used !== undefined && user !== used && !lineFor(user, used)) {
      lines.push({ a: user, b: used, from: user, labels: [] });
    }
  }
  for (const line of lines) {
    line.labels.push(
      ...new Set([...bindingNames(line.a, line.b), ...bindingNames(line.b, line.a)]),
    );
  }
  for (const { row, reach } of labelRows) {
    const text = row.resourceType === "Alchemy.Random" ? "shared secret" : row.logicalId;
    reach.forEach((a, index) => {
      for (const b of reach.slice(index + 1)) {
        const line = lineFor(a, b);
        if (line) {
          line.labels.push(text);
        } else {
          lines.push({ a, b, from: null, labels: [text] });
        }
      }
    });
  }

  return { boxes, lines, urls: new Set(rows.flatMap((row) => row.urls)) };
}

export type StageDiagram = ReturnType<typeof stageDiagram>;

/** What a box says under its name: its type name, then the schedule of a Worker in words. */
export const boxSubtitle = (box: DiagramBox) =>
  [
    box.typeName,
    ...box.rows.flatMap((row) => row.facts.filter((fact) => fact.clock).map((fact) => fact.value)),
  ].join(", ");

export interface StageTreeNode {
  box: DiagramBox;
  /** The labels of the line from the box above, such as the binding name `PRICES`. */
  labels: string[];
  /** The boxes that this box uses. A repeated node has none. */
  children: StageTreeNode[];
  /** The box shows earlier in the tree, with its children there. */
  repeated: boolean;
  /**
  The boxes that share a folded resource with this box and neither uses the other, in words, such as
  `with Site (shared secret)`. Each such line shows once, at its first box.
  */
  shared: string[];
}

const withLabels = (name: string, labels: readonly string[]) =>
  labels.length === 0 ? name : `${name} (${labels.join(", ")})`;

/**
The boxes of a stage as a tree: each box under the box that uses it, from the boxes that no box uses,
in box order. A box that more than one box uses shows in full once, then by name. A box in a loop of
lines that no other box uses starts a tree of its own.
*/
export function stageTree({ boxes, lines }: StageDiagram) {
  const used = new Set(
    lines.flatMap((line) =>
      line.from === line.a ? [line.b] : line.from === line.b ? [line.a] : [],
    ),
  );
  const shown = new Set<DiagramBox>();
  const node = (box: DiagramBox, labels: string[]): StageTreeNode => {
    if (shown.has(box)) {
      return { box, labels, children: [], repeated: true, shared: [] };
    }
    shown.add(box);
    const children = lines.flatMap((line) =>
      line.from !== box ? [] : [{ other: line.a === box ? line.b : line.a, labels: line.labels }],
    );
    return {
      box,
      labels,
      children: children.map(({ other, labels: childLabels }) => node(other, childLabels)),
      repeated: false,
      shared: lines.flatMap((line) =>
        line.from === null && line.a === box
          ? [`with ${withLabels(line.b.name, line.labels)}`]
          : [],
      ),
    };
  };
  const roots = boxes.filter((box) => !used.has(box)).map((box) => node(box, []));
  for (const box of boxes) {
    if (!shown.has(box)) {
      roots.push(node(box, []));
    }
  }
  return roots;
}

/** A tree node's name with the labels of its line, such as `Prices (PRICES)`. */
export const nodeTitle = (node: StageTreeNode) => withLabels(node.box.name, node.labels);

/** The bindings of the rows of `box`, each with the other box that holds a row it names. */
const boxBindings = (box: DiagramBox, boxes: readonly DiagramBox[]): BoxBinding[] =>
  box.rows
    .flatMap((row) => row.bindings)
    .map(({ ids, ...binding }) => ({
      ...binding,
      box:
        boxes.find(
          (other) =>
            other !== box && other.rows.some((row) => row.ids.some((id) => ids.includes(id))),
        ) ?? null,
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

/** The binding names of `box` that name `other`. */
const bindingNames = (box: DiagramBox, other: DiagramBox) =>
  box.bindings.filter((binding) => binding.box === other).map((binding) => binding.name);

/**
The rows that get a box, as groups that share one box, in row order: the Cloudflare Email rows, and
Convex deployments with the same `attr.url`.
*/
function boxGroups(rows: DiagramRow[]) {
  const groups: { email: boolean; rows: [DiagramRow, ...DiagramRow[]] }[] = [];
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
    const same =
      row.deploymentUrl === null
        ? undefined
        : groups.find((group) =>
            group.rows.some((other) => other.deploymentUrl === row.deploymentUrl),
          );
    if (same) {
      same.rows.push(row);
    } else {
      groups.push({ email: false, rows: [row] });
    }
  }
  return groups;
}

/**
The box that each folded row attaches to (`home`, by fqn), and the folded rows that connect two or
more boxes (`labelRows`), which attach to none.
*/
function foldRows(
  folded: DiagramRow[],
  boxOf: Map<string, DiagramBox>,
  neighbours: (row: DiagramRow) => string[],
) {
  const boxesOf = (fqns: readonly string[], boxAt: (fqn: string) => DiagramBox | undefined) => [
    ...new Set(fqns.map(boxAt).filter((box) => box !== undefined)),
  ];
  const direct = (row: DiagramRow) => boxesOf(neighbours(row), (fqn) => boxOf.get(fqn));
  const home = new Map<string, DiagramBox>();
  for (const row of folded) {
    const [first, ...others] =
      row.resourceType === "Convex.Project"
        ? boxesOf(row.downstream, (fqn) => boxOf.get(fqn))
        : direct(row);
    if (first && (others.length === 0 || row.resourceType === "Convex.Project")) {
      home.set(row.fqn, first);
    }
  }
  // A row that reaches no box attaches through the folded rows next to it.
  for (let changed = true; changed;) {
    changed = false;
    for (const row of folded) {
      if (home.has(row.fqn) || direct(row).length > 0) {
        continue;
      }
      const [via, ...others] = boxesOf(neighbours(row), (fqn) => home.get(fqn));
      if (via && others.length === 0) {
        home.set(row.fqn, via);
        changed = true;
      }
    }
  }
  const labelRows: { row: DiagramRow; reach: DiagramBox[] }[] = [];
  for (const row of folded) {
    if (row.resourceType === "Convex.Project") {
      continue;
    }
    const reach = [
      ...new Set([
        ...direct(row),
        ...boxesOf(
          row.downstream.filter((fqn) => !boxOf.has(fqn)),
          (fqn) => home.get(fqn),
        ),
      ]),
    ];
    const [only, ...others] = reach;
    if (others.length > 0) {
      home.delete(row.fqn);
      labelRows.push({ row, reach });
    } else if (only) {
      home.set(row.fqn, only);
    }
  }
  return { home, labelRows };
}
