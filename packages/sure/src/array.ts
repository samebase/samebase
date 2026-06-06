import { sure, bad, good } from "./core.ts";
import type { Bad, Good, Unsure } from "./core.ts";

export interface ArraySure<TSchema> {
  (value: unknown): Good<unknown[]> | Bad<unknown[]>;
  meta: {
    type: "array";

    schema: TSchema;
  };
}

function isArraySchema(value: unknown): value is (elem: unknown) => Unsure<unknown, unknown> {
  return typeof value === "function";
}

export function array<TSchema>(schema: TSchema): ArraySure<TSchema> {
  const struct = sure(
    (value) => {
      if (!Array.isArray(value)) {
        return bad([]);
      }

      if (!isArraySchema(schema)) {
        return bad([]);
      }

      let atLeastOneBad = false;
      let bads = [];
      let goods = [];

      for (const elem of value) {
        const [good, unsure] = schema(elem);

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
      }

      if (atLeastOneBad) {
        return bad(bads);
      }

      return good(goods);
    },
    {
      type: "array",

      schema,
    },
  );

  // @ts-expect-error Expected error
  return struct;
}
