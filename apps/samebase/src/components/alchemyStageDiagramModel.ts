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
