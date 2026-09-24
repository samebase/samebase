import { sure, bad, good } from "./core.ts";
import type { Sure, MayAsync, InferBad, InferGood, MetaObj } from "./core.ts";
import { forEach, mapResult } from "./async.ts";
import { fail, type AnyValidation, type Issue } from "./issue.ts";

export function array<TSchema extends AnyValidation>(
  schema: TSchema,
): Sure<
  //
  readonly Issue<InferBad<TSchema>[number]["error"] | "not array">[],
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
        return fail("not array");
      }

      let failed = false;
      const issues: Issue[] = [];
      const goods: unknown[] = [];
      let index = 0;

      return forEach(
        value,
        (elem) => {
          const key = index++;
          return mapResult(schema(elem), ([good, unsure]) => {
            if (good) {
              goods.push(unsure);
            } else {
              failed = true;
              for (const issue of unsure) {
                issues.push({ path: [key, ...issue.path], error: issue.error });
              }
            }
          });
        },
        () => (failed ? bad(issues) : good(goods)),
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
