import { isRecord } from "@samebase/dependent/main";
import { validate } from "convex-helpers/validators";
import { v, type Infer } from "convex/values";
import { RUN_RECORD_KEY } from "./alchemyState";
import { vAlchemyRunRecord } from "./alchemyStateModel";

const { array, literal, number, object, string, union } = v;

/**
One resource of a stage, as the stacks page shows it. Only these three fields leave the server: the
rest of a row (`props`, `attr`) can hold a secret that Alchemy did not mark, so it stays in the action.
`resourceType` and `status` are null when the row does not have them as strings.
*/
const vStoreResource = object({
  fqn: string(),
  resourceType: union(string(), v.null()),
  status: union(string(), v.null()),
});
export type StoreResource = Infer<typeof vStoreResource>;

/** A stage, with the run record of its output when the output has a valid one. */
const vStoreStage = object({
  name: string(),
  run: union(vAlchemyRunRecord, v.null()),
  resources: array(vStoreResource),
});
export type StoreStage = Infer<typeof vStoreStage>;

/** A stack, or a stack whose stages Samebase could not read. Other stacks still show. */
const vStoreStack = union(
  object({ name: string(), read: literal("ok"), stages: array(vStoreStage) }),
  object({ name: string(), read: literal("failed") }),
);
export type StoreStack = Infer<typeof vStoreStack>;

/** The read of one Alchemy state store. */
export const vStateStoreRead = union(
  /** The organization has no connection to the provider. */
  object({ state: literal("not_connected") }),
  /** The provider refused the connection's token: an owner must connect again. */
  object({ state: literal("reconnect") }),
  /** The connection cannot make the requests of the read, such as a Cloudflare MCP connection. */
  object({ state: literal("unsupported_connection") }),
  /** The account or team holds no state store that Samebase can find. */
  object({ state: literal("no_store") }),
  object({ state: literal("unsupported_version"), version: number() }),
  object({ state: literal("failed") }),
  object({ state: literal("found"), stacks: array(vStoreStack) }),
);
export type StateStoreRead = Infer<typeof vStateStoreRead>;

/** The reply of the stacks page: the Cloudflare account store and the Convex team store. */
export const vOrganizationStacks = object({
  cloudflare: object({ account: union(string(), v.null()), read: vStateStoreRead }),
  convex: object({ team: union(string(), v.null()), read: vStateStoreRead }),
});
export type OrganizationStacks = Infer<typeof vOrganizationStacks>;

/** The fields of a resource row that the page shows, from the row's parsed JSON. */
export function storeResource(fqn: string, row: unknown): StoreResource {
  const resourceType = isRecord(row) ? row["resourceType"] : undefined;
  const status = isRecord(row) ? row["status"] : undefined;
  return {
    fqn,
    resourceType: typeof resourceType === "string" ? resourceType : null,
    status: typeof status === "string" ? status : null,
  };
}

/** The run record of a stage output, or null when the output has no valid one. */
export function storeStageRun(output: unknown): StoreStage["run"] {
  const run = isRecord(output) ? output[RUN_RECORD_KEY] : undefined;
  return validate(vAlchemyRunRecord, run) ? run : null;
}

/**
Parses a JSON text of the store. A text that is not JSON gives undefined: the error of `JSON.parse`
can quote the text, and the text can hold a secret.
*/
export function parseStoreJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
