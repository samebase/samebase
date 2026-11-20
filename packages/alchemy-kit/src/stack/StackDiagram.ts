import * as Schema from "effect/Schema";
import { resourceTypeUI, type IconNode, type ResourceCategory } from "../ui/ResourceTypeUI.ts";
import { asRecord, list, readString } from "./json.ts";
import { resourceDashboard, resourceFacts } from "./ResourceFacts.ts";

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
          .filter((name) => name !== undefined);
        return [{ sid, bucketNames }];
      }),
      /** The bucket of an R2 bucket row, which a Worker's R2 binding names. */
      bucketName: readString(attr, "bucketName") ?? null,
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
  rows: DiagramRow[];
  /** The rows without a box of their own that attach to this box. */
  folded: DiagramRow[];
  link: string | null;
  urls: string[];
  namespace: string[];
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
    };
  });
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
  for (const box of boxes) {
    for (const row of box.rows) {
      for (const fqn of row.downstream) {
        const user = boxOf.get(fqn) ?? home.get(fqn);
        if (user === undefined || user === box || lineFor(user, box)) {
          continue;
        }
        lines.push({ a: user, b: box, from: user, labels: [] });
      }
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

/** The Worker binding names of `worker` that name a row of `other`, by logical id or R2 bucket. */
function bindingNames(worker: DiagramBox, other: DiagramBox) {
  return worker.rows
    .filter((row) => row.resourceType === "Cloudflare.Worker")
    .flatMap((row) => row.bindings)
    .filter(({ sid, bucketNames }) =>
      other.rows.some(
        (target) =>
          target.logicalId.toLowerCase() === sid.toLowerCase() ||
          (target.bucketName !== null && bucketNames.includes(target.bucketName)),
      ),
    )
    .map(({ sid }) => sid);
}

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
