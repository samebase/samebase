import type { InferGood, InferInput, MetaNever, MetaObj, Sure } from "./core.ts";

/**
Derive a type predicate from a schema, so the `value is ...` claim is never
hand-written at a use site. The predicate target is inferred from the schema:
when the schema evolves, every guard produced here follows it automatically,
and the "disconnected type safety" drift (a hand-written predicate narrowing
to a stale shape after the schema changed) cannot happen.

Only for refining schemas. The claim is about the input value as-is, so a
schema whose good value is a transformed output (an `after` that parses or
reshapes) must not pass through here — the guard would claim the input is
already the transformed value.

@example
const isVault = guard(vault);
if (isVault(value)) {
  value; // InferGood<typeof vault> — inferred, not asserted
}
 */
export function guard<TSchema extends Sure<unknown, unknown, any, MetaObj | MetaNever>>(
  schema: TSchema,
): (value: InferInput<TSchema>) => value is InferInput<TSchema> & InferGood<TSchema> {
  return (value): value is InferInput<TSchema> & InferGood<TSchema> => schema(value)[0];
}
