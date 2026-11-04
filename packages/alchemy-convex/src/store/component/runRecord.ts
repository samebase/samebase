import { v, type GenericValidator, type Infer } from "convex/values";

export const runRecord = v.object({
  version: v.literal(1),
  repository: v.string(),
  stackFile: v.string(),
  branch: v.string(),
  pullRequest: v.union(v.number(), v.null()),
  headCommit: v.string(),
  runUrl: v.union(v.string(), v.null()),
  source: v.union(v.literal("github-actions"), v.literal("laptop")),
  recordedAt: v.string(),
});

type RunRecord = Infer<typeof runRecord>;

/**
 * True when a write with `next` must replace `current`, the record of the stage. Records that differ
 * only in `recordedAt`, the time of one write, name the same run. Two laptop deploys of one commit
 * have no `runUrl`, so they are the same run too. A write without a record (`null`) clears one.
 */
export const runChanged = (current: RunRecord | undefined, next: RunRecord | null) => {
  if (next === null || current === undefined) return next !== null || current !== undefined;
  const other = new Map(Object.entries(next));
  return Object.entries(current).some(
    ([field, value]) => field !== "recordedAt" && other.get(field) !== value,
  );
};

/** Whether `value` passes `validator`. Only the kinds of {@link runRecord} pass; another kind fails. */
export const validate = <V extends GenericValidator>(
  validator: V,
  value: unknown,
  // eslint-disable-next-line samebase/no-hand-written-type-predicate -- A component imports no app package, and the switch walks the validator itself.
): value is Infer<V> => {
  switch (validator.kind) {
    case "object": {
      if (typeof value !== "object" || value === null) return false;
      const fields = new Map(Object.entries(value));
      return Object.entries(validator.fields).every(([key, field]) =>
        validate(field, fields.get(key)),
      );
    }
    case "union":
      return validator.members.some((member) => validate(member, value));
    case "literal":
      return value === validator.value;
    case "string":
      return typeof value === "string";
    case "float64":
      return typeof value === "number";
    case "null":
      return value === null;
    default:
      return false;
  }
};
