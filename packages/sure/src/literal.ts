import { good, sure } from "./core.ts";
import { fail } from "./issue.ts";
import type { Primitive } from "./core.ts";

export const literal = <
  // so that `as const` is not needed
  T extends Primitive,
>(
  value: T,
) => {
  return sure(
    (val) => {
      if (val === value) {
        return good<T>(
          // @ts-expect-error We do an explicit check above
          val,
        );
      }

      return fail(`not literal ${typeof value} (${String(value)})` as const);
    },
    {
      type: "literal",
      value,
    },
  );
};

export const is = literal;
