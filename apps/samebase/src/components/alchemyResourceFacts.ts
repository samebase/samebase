import { notEmpty } from "@samebase/dependent";
import { asRecord, readString, type JsonRecord } from "../../convex/jsonUtils";

/**
A fact about a resource from its state row, for the details of a stack diagram box. `clock` marks
the fact that the box itself shows as a clock mark, with the value as its title.
*/
export type ResourceFact = { label: string; value: string; clock?: true };

type StateFields = { attr: JsonRecord; props: JsonRecord };

const strings = (value: unknown) =>
  (Array.isArray(value) ? value : []).filter((item) => typeof item === "string");

/**
The location hints of R2 buckets and D1 databases.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.87/packages/cloudflare/src/D1/Database.ts
*/
const LOCATIONS = new Map(
  Object.entries({
    wnam: "Western North America",
    enam: "Eastern North America",
    weur: "Western Europe",
    eeur: "Eastern Europe",
    apac: "Asia Pacific",
    oc: "Oceania",
  }),
);

const fact = (label: string, value: string | undefined): ResourceFact[] =>
  value ? [{ label, value }] : [];

const listFact = (label: string, values: string[]) => fact(label, values.join(", "));

const locationFact = (location: string | undefined) =>
  fact("Location", location && (LOCATIONS.get(location) ?? location));

/** A jurisdiction other than `default`, which every bucket and database has unless set. */
const jurisdictionFact = (attr: JsonRecord) => {
  const jurisdiction = readString(attr, "jurisdiction");
  return fact("Jurisdiction", jurisdiction === "default" ? undefined : jurisdiction);
};

const pad = (value: number) => String(value).padStart(2, "0");
const whole = (field: string, below: number) =>
  /^\d{1,2}$/.test(field) && Number(field) < below ? Number(field) : undefined;

/**
A Cloudflare cron trigger in words, in UTC as Cloudflare runs them: `0 3 * * *` is "Daily at 03:00
UTC", `5 * * * *` "Hourly at :05", `*\/15 * * * *` "Every 15 minutes". Any other cron stays as it is.
*/
export function cronInWords(cron: string) {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5 || fields.slice(2).some((field) => field !== "*")) {
    return cron;
  }
  const [minuteField, hourField] = fields;
  const minute = whole(minuteField, 60);
  const hour = whole(hourField, 24);
  if (minute !== undefined && hour !== undefined) {
    return `Daily at ${pad(hour)}:${pad(minute)} UTC`;
  }
  if (minute !== undefined && hourField === "*") {
    return `Hourly at :${pad(minute)}`;
  }
  const every = /^\*\/(\d+)$/.exec(minuteField)?.[1];
  return every && hourField === "*" ? `Every ${every} minutes` : cron;
}

/**
The facts of each resource type that a diagram box shows in its details, read from the `attr` and
`props` of its state row. A type without an entry has no facts. A fact leaves out what the box
already shows: its name, its type and its link.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.87/packages/cloudflare/src/Workers/Worker.ts
@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.87/packages/cloudflare/src/R2/Bucket.ts
*/
const FACTS = new Map<string, (row: StateFields) => ResourceFact[]>([
  [
    "Cloudflare.Worker",
    ({ attr, props }) => {
      const domain = asRecord(attr["domain"]);
      const crons = strings(attr["crons"]);
      return [
        ...(crons.length === 0
          ? []
          : [
              { label: "Schedule", value: crons.map(cronInWords).join(", "), clock: true as const },
            ]),
        ...listFact(
          "Custom domains",
          [readString(domain, "name"), ...strings(domain["aliases"])].filter(notEmpty),
        ),
        ...listFact(
          "Routes",
          (Array.isArray(attr["routes"]) ? attr["routes"] : [])
            .map((route) => readString(asRecord(route), "pattern"))
            .filter(notEmpty),
        ),
        ...fact("Compatibility date", readString(asRecord(props["compatibility"]), "date")),
      ];
    },
  ],
  [
    "Cloudflare.R2.Bucket",
    ({ attr, props }) => {
      const storageClass = readString(attr, "storageClass");
      return [
        ...locationFact(readString(attr, "location")),
        ...jurisdictionFact(attr),
        ...fact("Storage class", storageClass === "Standard" ? undefined : storageClass),
        // `publicDomain` is the r2.dev host, set only while public access is on.
        ...fact(
          "Public access",
          readString(attr, "publicDomain") ?? (props["publicAccess"] === true ? "On" : undefined),
        ),
        ...listFact(
          "Custom domains",
          (Array.isArray(attr["domains"]) ? attr["domains"] : [])
            .map((domain) => readString(asRecord(domain), "domain"))
            .filter(notEmpty),
        ),
      ];
    },
  ],
  // A D1 database keeps its location hint only in its props.
  [
    "Cloudflare.D1Database",
    ({ attr, props }) => [
      ...locationFact(readString(props, "primaryLocationHint")),
      ...jurisdictionFact(attr),
    ],
  ],
  [
    "Convex.Deployment",
    ({ attr }) => {
      const count = strings(attr["envNames"]).length;
      return fact("Environment variables", count === 0 ? undefined : String(count));
    },
  ],
]);

const dashboard = (accountId: string | undefined, ...path: string[]) =>
  accountId
    ? `https://dash.cloudflare.com/${[accountId, ...path].map(encodeURIComponent).join("/")}`
    : undefined;

/**
The Cloudflare dashboard page of a Worker or a D1 database, as a menu link of its box. The dashboard
has no confirmed page address for one D1 database, so a database links to the D1 list of its
account.

@see https://developers.cloudflare.com/d1/get-started/
*/
const DASHBOARDS = new Map<
  string,
  (attr: JsonRecord) => { href: string; label: string } | undefined
>([
  [
    "Cloudflare.Worker",
    (attr) => {
      const workerName = readString(attr, "workerName");
      const href =
        workerName &&
        dashboard(readString(attr, "accountId"), "workers", "services", "view", workerName);
      return workerName && href ? { href, label: workerName } : undefined;
    },
  ],
  [
    "Cloudflare.D1Database",
    (attr) => {
      const href = dashboard(readString(attr, "accountId"), "workers", "d1");
      return href ? { href, label: "D1 databases" } : undefined;
    },
  ],
]);

export const resourceFacts = (resourceType: string, row: StateFields) =>
  FACTS.get(resourceType)?.(row) ?? [];

export const resourceDashboard = (resourceType: string, attr: JsonRecord) =>
  DASHBOARDS.get(resourceType)?.(attr);
