import type { InferGood, InferInput, Sure } from "./core.ts";
import type { StandardSchemaV1 } from "./standardSpec.ts";

// Same check as `isObject` in object.ts, duplicated so this module has no
// runtime imports — core.ts imports `standardProps` at runtime, and importing
// object.ts back here would create a runtime cycle (object.ts needs core.ts
// at module-init time).
function isDictionary(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/**
 * The vendor name reported through `~standard.vendor`.
 */
export const SURE_VENDOR = "sure";

/**
 * Flattens a `bad` value into Standard Schema issues.
 *
 * Sure validators report failures as plain values rather than issue lists:
 *
 * - primitives return message strings (`"not string"`)
 * - `object()` returns `{ key: <nested bad> }` for failing properties
 * - `array()`/`tuple()` return arrays aligned with the input, where `undefined`
 *   marks positions that validated fine
 *
 * This walks that structure, interpreting objects and arrays as nesting
 * (recording the keys/indices as the issue path) and everything else as a leaf.
 * Leaf values that aren't strings are stringified where that yields something
 * useful (numbers, booleans, `Error#message`, ...) — custom validators that
 * want precise standard issues should return string (or nested string) bads.
 *
 * A failure must never produce zero issues (a falsy/empty `issues` would read
 * as success downstream), so hand-crafted message-less bads (e.g. `bad({})`,
 * `bad(undefined)`, `bad(() => {})`) fall back to a generic issue.
 */
export function toStandardIssues(bad: unknown): StandardSchemaV1.Issue[] {
  const issues: StandardSchemaV1.Issue[] = [];

  collectIssues(bad, [], issues, new WeakSet());

  if (issues.length === 0) {
    issues.push({ message: "Invalid value" });
  }

  return issues;
}

function collectIssues(
  bad: unknown,
  path: readonly PropertyKey[],
  issues: StandardSchemaV1.Issue[],
  seen: WeakSet<object>,
): void {
  // `undefined` marks "no issue here": array()/tuple() pad their bads with it
  // to keep indices aligned with the input. (Inside objects, a *present* key
  // holding undefined means the property failed — handled in the dictionary
  // branch below.)
  if (bad === undefined) {
    return;
  }

  if (typeof bad === "string") {
    issues.push(makeIssue(bad, path));
    return;
  }

  if (Array.isArray(bad)) {
    if (seen.has(bad)) {
      // A cyclic bad must not overflow the stack — report the revisit and stop.
      issues.push(makeIssue("Invalid value", path));
      return;
    }
    seen.add(bad);

    const before = issues.length;

    for (const [index, elem] of bad.entries()) {
      collectIssues(elem, [...path, index], issues, seen);
    }

    // A container that yields no issues of its own (e.g. a hand-crafted
    // `bad([])`) still represents a failure at this path — don't let it vanish.
    if (issues.length === before) {
      issues.push(makeIssue("Invalid value", path));
    }
    return;
  }

  // Error bads are natural to return from custom validators; their `message`
  // is non-enumerable, so without this case it would be silently lost.
  if (bad instanceof Error) {
    issues.push(makeIssue(bad.message || "Invalid value", path));
    return;
  }

  if (isDictionary(bad)) {
    if (seen.has(bad)) {
      issues.push(makeIssue("Invalid value", path));
      return;
    }
    seen.add(bad);

    const before = issues.length;

    for (const [key, value] of Object.entries(bad)) {
      if (value === undefined) {
        // Unlike array holes, object() marks failures by key *presence*: a
        // present key holding `bad(undefined)` is a failed property.
        issues.push(makeIssue("Invalid value", [...path, key]));
        continue;
      }

      collectIssues(value, [...path, key], issues, seen);
    }

    if (issues.length === before) {
      issues.push(makeIssue("Invalid value", path));
    }
    return;
  }

  // Non-string leaf: keep it as a message. After the checks above only
  // primitives and functions can reach this point.
  if (bad === null) {
    issues.push(makeIssue("null", path));
    return;
  }

  switch (typeof bad) {
    case "number":
    case "boolean":
    case "bigint":
    case "symbol":
      issues.push(makeIssue(String(bad), path));
      return;
    default:
      // Functions — nothing meaningful to extract.
      issues.push(makeIssue("Invalid value", path));
  }
}

function makeIssue(message: string, path: readonly PropertyKey[]): StandardSchemaV1.Issue {
  return path.length === 0 ? { message } : { message, path: [...path] };
}

/**
 * The `~standard` props sure attaches: identical to `StandardSchemaV1.Props`,
 * except `validate` is declared to always return synchronously (sure has no
 * async validators), so direct callers can skip the `instanceof Promise` dance
 * the general spec type requires. Still assignable to the spec interface.
 */
export interface SureStandardProps<Input = unknown, Output = Input>
  extends StandardSchemaV1.Props<Input, Output> {
  readonly validate: (
    value: unknown,
    options?: StandardSchemaV1.Options | undefined,
  ) => StandardSchemaV1.Result<Output>;
}

/**
 * The schema-facing side of {@link SureStandardProps}; a synchronous
 * `StandardSchemaV1`.
 */
export interface SureStandardSchema<Input = unknown, Output = Input> {
  readonly "~standard": SureStandardProps<Input, Output>;
}

/**
 * The given sure schema, with the Standard Schema `~standard` property attached.
 * This is the return type of `standard()`; factory-made schemas carry the same
 * props via the `StandardSure` alias in core.ts.
 */
export type WithStandard<TSure extends Sure<unknown, unknown, any>> = TSure &
  SureStandardSchema<InferInput<TSure>, InferGood<TSure>>;

/**
 * Makes a sure schema implement the
 * {@link https://standardschema.dev Standard Schema} interface, so it can be
 * passed directly to any library accepting a `StandardSchemaV1` (tRPC, TanStack
 * Form, the AI SDK, ...).
 *
 * Schemas created through `sure()`/`pure()` already carry `~standard`; this is
 * only needed for raw-function validators. The props are attached to the
 * existing function (sure schemas are functions, and functions are objects),
 * mirroring how `sure()` already attaches `meta`.
 *
 * @example
 * const user = standard(object({ name: string }));
 *
 * user("x")[0];                          // sure usage keeps working
 * user["~standard"].validate({});        // { issues: [{ message, path }] }
 * user["~standard"].validate({ name: "a" }); // { value: { name: "a" } }
 */
export function standard<TSure extends Sure<unknown, unknown, any>>(
  schema: TSure,
): WithStandard<TSure> {
  if ("~standard" in schema) {
    // Already attached (sure()/pure() do this automatically) — keep the
    // existing props object instead of replacing it.
    return schema as WithStandard<TSure>;
  }

  return Object.assign(schema, {
    "~standard": standardProps<InferInput<TSure>, InferGood<TSure>>(
      // TS can't relate a generic TSure to its own Infer* projections.
      schema as Sure<unknown, InferGood<TSure>, InferInput<TSure>>,
    ),
  });
}

/**
 * Builds the `~standard` props for a sure schema. Used by `standard()` and by
 * `sure()`/`pure()` in core.ts, which attach the props automatically.
 *
 * @internal Exported for core.ts; prefer `standard()` in application code.
 */
export function standardProps<TInput, TGood>(
  schema: Sure<unknown, TGood, TInput>,
): SureStandardProps<TInput, TGood> {
  return {
    version: 1,
    vendor: SURE_VENDOR,
    validate: (value) => {
      // The spec's contract is "validate accepts unknown and returns a
      // Result". Sure schemas may declare a narrower input (e.g. an `after`
      // second stage) and can throw on out-of-domain values — convert any
      // throw into a failure instead of breaking the consumer.
      try {
        const [isGood, unsure] = schema(value as TInput);

        if (isGood) {
          return { value: unsure };
        }

        return { issues: toStandardIssues(unsure) };
      } catch (error) {
        return {
          issues: [{ message: error instanceof Error ? error.message : String(error) }],
        };
      }
    },
  };
}
