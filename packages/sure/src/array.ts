import { sure, bad, good } from "./core.ts";
import type { Sure, AnySure, MayAsync, InferBad, InferGood, MetaObj } from "./core.ts";
import { forEach, mapResult } from "./async.ts";

export function array<TSchema extends AnySure<unknown>>(
  schema: TSchema,
): Sure<
  //
  Array<InferBad<TSchema> | undefined>,
  Array<InferGood<TSchema>>,
  unknown,
  MetaObj<{
    type: "array";

    schema: TSchema;
  }>,
  MayAsync<TSchema>
> {
  const struct = sure(
    (value) => {
      if (!Array.isArray(value)) {
        return bad([]);
      }

      let atLeastOneBad = false;
      const bads: unknown[] = [];
      const goods: unknown[] = [];

      return forEach(
        value,
        (elem) =>
          mapResult(schema(elem), ([good, unsure]) => {
            if (good) {
              goods.push(unsure);
              // This is necessary in order to maintain the same length
              bads.push(undefined);
            } else {
              bads.push(unsure);

              // Since the `bads` array can containe `undefined` values, it's more clear to
              // have an imperative boolean to make the check
              atLeastOneBad = true;
            }
          }),
        () => (atLeastOneBad ? bad(bads) : good(goods)),
      );
    },
    {
      type: "array",

      schema,
    },
  );

  // @ts-expect-error Child results determine the conditional return and inferred array payloads.
  return struct;
}
