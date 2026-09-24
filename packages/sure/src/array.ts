import { sure, bad, good } from "./core.ts";
import type { Sure, InferBad, InferGood, MetaObj } from "./core.ts";
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
  }>
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

      for (const elem of value) {
        const key = index++;
        const [good, unsure] = schema(elem);

        if (good) {
          goods.push(unsure);
        } else {
          failed = true;
          for (const issue of unsure) {
            issues.push({ path: [key, ...issue.path], error: issue.error });
          }
        }
      }

      if (failed) {
        return bad(issues);
      }

      return good(goods);
    },
    {
      type: "array",

      schema,
    },
  );

  // @ts-expect-error The child schema determines the array output and issue payloads.
  return struct;
}
