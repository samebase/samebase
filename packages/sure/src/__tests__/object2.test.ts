import { describe, expect, it } from "vite-plus/test";
import { bad, number, object2, standard, string } from "../index.ts";
import type { InferBad, InferGood } from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

const person = object2({
  age: number,
  address: object2({
    country: string,
  }),
});

assertEqual<
  InferGood<typeof person>,
  {
    age: number;
    address: {
      country: string;
    };
  }
>(true);

describe("object2", () => {
  it("infers path-aware bad tuples", () => {
    const typedBad: InferBad<typeof person> = [
      [["age"], "not number"],
      [["address"], "not object"],
      [["address", "country"], "not string"],
    ];

    expect(typedBad).toStrictEqual([
      [["age"], "not number"],
      [["address"], "not object"],
      [["address", "country"], "not string"],
    ]);
  });

  it("returns path-aware failures for direct properties", () => {
    expect(
      object2({
        age: number,
      })({
        age: "12",
      }),
    ).toStrictEqual(bad([[["age"], "not number"]]));
  });

  it("returns an empty path when the value is not an object", () => {
    expect(person("not object")).toStrictEqual(bad([[[], "not object"]]));
  });

  it("prefixes nested object2 paths", () => {
    expect(
      person({
        age: "12",
        address: {
          country: 123,
        },
      }),
    ).toStrictEqual(
      bad([
        [["age"], "not number"],
        [["address", "country"], "not string"],
      ]),
    );
  });

  it("keeps child object root failures at the child property path", () => {
    expect(
      person({
        age: 12,
        address: "not object",
      }),
    ).toStrictEqual(bad([[["address"], "not object"]]));
  });

  it("can be reported through Standard Schema", () => {
    expect(
      standard(person)["~standard"].validate({
        age: "12",
        address: {
          country: 123,
        },
      }),
    ).toStrictEqual({
      issues: [
        { message: "not number", path: ["age"] },
        { message: "not string", path: ["address", "country"] },
      ],
    });
  });
});
