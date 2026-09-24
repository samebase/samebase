import { sure, bad, good, under } from "./core.ts";
import type { Sure, InferGood, InferMessage, Issue, Issues, MetaNever, MetaObj } from "./core.ts";

export function array<
  //
  TSchema extends Sure<Issues, unknown, unknown, MetaObj | MetaNever>,
>(
  schema: TSchema,
): Sure<
  //
  Issues<"not array" | InferMessage<TSchema>>,
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
        return bad([{ message: "not array" }]);
      }

      const issues: Issue[] = [];
      const goods = [];

      for (const [index, elem] of value.entries()) {
        const [good, unsure] = schema(elem);

        if (good) {
          goods.push(unsure);
        } else {
          issues.push(...under(index, unsure));
        }
      }

      if (issues.length) {
        return bad(issues);
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
