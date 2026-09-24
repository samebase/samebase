/* eslint-disable no-unused-vars -- type-test scaffolding */
import { describe, it, expect, assert } from "vite-plus/test";
import {
  recurse,
  after,
  intersection,
  array,
  bad,
  good,
  object,
  union,
  pure,
  string,
  sure,
  unknown,
  recursiveElem,
  number,
  tuple,
  literal,
} from "../index.ts";
import type {
  InferBad,
  InferGood,
  InferInput,
  InferMeta,
  Issues,
  MetaNever,
  MetaObj,
  RecurseSymbol,
  Sure,
} from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

describe("recursive", () => {
  describe("simple recursive array", () => {
    const baseObj = object({
      name: string,
      children: recursiveElem,
    });

    const recurseSure = recurse(baseObj, (recurseSure) => {
      return array(recurseSure);
    });

    // TypeChecks
    type InferredGood = InferGood<typeof recurseSure>;
    type InferredBad = InferBad<typeof recurseSure>;
    type InferredInput = InferInput<typeof recurseSure>;
    type InferredMeta = InferMeta<typeof recurseSure>;

    assertEqual<InferredInput, unknown>(true);

    assertEqual<
      InferredGood,
      {
        name: string;
        children: {
          name: string;
          children: typeof RecurseSymbol;
        }[];
      }
    >(true);
    //////

    assertEqual<InferredBad, Issues<"not object" | "not string" | "not array">>(true);

    assertEqual<
      InferredMeta,
      MetaObj<{
        baseObj: Sure<
          Issues<"not object" | "not string">,
          {
            name: string;
            children: typeof RecurseSymbol;
          },
          unknown
        >;
        childParser: (
          surer: Sure<
            Issues<"not object" | "not string">,
            {
              name: string;
              children: typeof RecurseSymbol;
            },
            unknown
          >,
        ) => Sure<
          Issues<"not array" | "not object" | "not string">,
          {
            name: string;
            children: typeof RecurseSymbol;
          }[],
          unknown
        >;
      }>
    >(true);

    assertEqual<
      typeof recurseSure,
      Sure<
        //
        InferredBad,
        InferredGood,
        InferredInput,
        InferredMeta
      >
    >(true);

    it("should return good value", () => {
      const value = recurseSure({
        name: "hello",
        children: [
          {
            name: "world",
            children: [],
          },
        ],
      });

      expect(value).toStrictEqual([
        true,
        {
          name: "hello",
          children: [
            {
              name: "world",
              children: [],
            },
          ],
        },
      ]);
    });

    it("should point to the bad value at any depth", () => {
      const value = recurseSure({
        name: "hello",
        children: [
          {
            name: "world",
            children: [{ name: 1, children: [] }],
          },
        ],
      });

      expect(value).toStrictEqual([
        false,
        [{ message: "not string", path: ["children", 0, "children", 0, "name"] }],
      ]);
    });
  });

  describe("complex recursive object", () => {
    const complexSure = object({
      value: number,

      left: recursiveElem,

      right: recursiveElem,
    });

    const recurseComplexSure = recurse(
      //
      complexSure,
      (inner) =>
        //
        union(
          intersection(
            inner,
            object({
              parent: number,
            }),
          ),
          literal("end"),
        ),
    );

    type InferredGood = InferGood<typeof recurseComplexSure>;
    type InferredBad = InferBad<typeof recurseComplexSure>;
    type InferredInput = InferInput<typeof recurseComplexSure>;
    type InferredMeta = InferMeta<typeof recurseComplexSure>;

    assertEqual<InferredInput, unknown>(true);

    assertEqual<
      //
      InferredGood,
      {
        value: number;
        left:
          | ({
              value: number;
              left: typeof RecurseSymbol;
              right: typeof RecurseSymbol;
            } & {
              parent: number;
            })
          | "end";
        right:
          | ({
              value: number;
              left: typeof RecurseSymbol;
              right: typeof RecurseSymbol;
            } & {
              parent: number;
            })
          | "end";
      }
    >(true);

    assertEqual<
      InferredBad,
      Issues<
        | "not object"
        | "not number"
        | `not literal string (${string})`
        | `not literal number (${string})`
        | `not literal bigint (${string})`
        | `not literal boolean (${string})`
        | `not literal symbol (${string})`
        | `not literal undefined (${string})`
        | `not literal object (${string})`
        | `not literal function (${string})`
      >
    >(true);

    it("should work for complex things", () => {
      const value = recurseComplexSure({
        value: 4,

        right: "end",

        left: {
          value: 3,

          parent: 8,

          // @ts-expect-error, TODO: add several more levels?
          left: "end",
          // @ts-expect-error, TODO: add several more levels?
          right: "end",
        },
      } satisfies InferredGood);

      expect(value).toStrictEqual([
        true,
        {
          value: 4,

          right: "end",

          left: {
            value: 3,

            parent: 8,

            left: "end",
            right: "end",
          },
        },
      ]);
    });
    it("should fail for complex things", () => {
      const value = recurseComplexSure({
        value: 4,

        right: "end",

        left: {
          value: 3,

          // @ts-expect-error, TODO: add several more levels?
          parent: "8",

          // @ts-expect-error, TODO: add several more levels?
          left: "end",
          // @ts-expect-error, TODO: add several more levels?
          right: "end",
        },
      } satisfies InferredGood);

      expect(value).toStrictEqual([
        false,
        [
          // The `left` is neither an object with a `parent`, nor "end"
          { message: "not number", path: ["left", "parent"] },
          { message: "not literal string (end)", path: ["left"] },
        ],
      ]);
    });
  });
});
