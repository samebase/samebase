// eslint-disable-next-line no-unused-vars -- type-test scaffolding
import { describe, it, expect } from "vite-plus/test";
import {
  InferBad,
  InferGood,
  InferInput,
  Sure,
  good,
  // eslint-disable-next-line no-unused-vars -- type-test scaffolding
  sure,
  bad,
  InferMeta,
  // eslint-disable-next-line no-unused-vars -- type-test scaffolding
  MetaObj,
  pure,
  MetaNever,
} from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

export const nonEmptyString = pure((x) => {
  return typeof x === "string" //
    ? good(x)
    : bad("not string" as const);
});

describe("primitives", () => {
  it("should return good value", () => {
    nonEmptyString("1");

    assertEqual<typeof nonEmptyString, Sure<"not string", string, unknown, MetaNever>>(true);

    assertEqual<InferGood<typeof nonEmptyString>, string>(true);
    assertEqual<InferBad<typeof nonEmptyString>, "not string">(true);
    assertEqual<InferInput<typeof nonEmptyString>, unknown>(true);
    assertEqual<InferMeta<typeof nonEmptyString>, MetaNever>(true);
  });
});
