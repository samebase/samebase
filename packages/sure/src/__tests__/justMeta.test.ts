import { describe, expect, it } from "vite-plus/test";
import { MetaNever, MetaObj } from "../core.ts";
import { InferJustMeta, ExtractPrimitives, justMeta, metaToJsonSchema } from "../meta_wip.ts";
import { object, optional } from "../object.ts";
import { string, number } from "../primitives.ts";
import { PrettifyRec } from "../utils.ts";
import { assertEqual } from "./typeTestUtils.ts";
import { array } from "../array.ts";

import { Ajv } from "ajv";

const simpleObj = object({
  name: optional(string),
  age: number,
  info: object({
    country: array(string),
  }),
});

// eslint-disable-next-line no-unused-vars -- type-test scaffolding
type SimplifyMeta<TMeta extends MetaNever | MetaObj> = TMeta extends MetaObj<infer S> ? S : {};

type InferredJustMeta = InferJustMeta<typeof simpleObj>;
type Prett = PrettifyRec<InferredJustMeta>;

const temp = optional(number);
// eslint-disable-next-line no-unused-vars -- type-test scaffolding
type tempType = InferJustMeta<typeof temp>;

assertEqual<
  Prett,
  {
    type: "object";
    schema: {
      name: {
        type: "optional";
        schema: {
          type: "string";
        };
      };
      age: {
        type: "number";
      };
      info: {
        type: "object";
        schema: {
          country: {
            type: "array";
            schema: {
              type: "string";
            };
          };
        };
      };
    };
  }
>(true);

// eslint-disable-next-line no-unused-vars -- type-test scaffolding
type InferredString = InferJustMeta<typeof string>;

// eslint-disable-next-line no-unused-vars -- type-test scaffolding
type test3 = ExtractPrimitives<{
  name: typeof string;
}>;

//

describe("justMeta", () => {
  it("works", () => {
    const result = justMeta(simpleObj);

    assertEqual<
      typeof result,
      {
        type: "object";
        schema: {
          name: {
            type: "optional";
            schema: {
              type: "string";
            };
          };
          age: {
            type: "number";
          };
          info: {
            type: "object";
            schema: {
              country: {
                type: "array";
                schema: {
                  type: "string";
                };
              };
            };
          };
        };
      }
    >(true);

    expect(result).toStrictEqual({
      type: "object",
      schema: {
        name: {
          type: "optional",
          schema: {
            type: "string",
          },
        },
        age: {
          type: "number",
        },
        info: {
          type: "object",
          schema: {
            country: {
              type: "array",
              schema: {
                type: "string",
              },
            },
          },
        },
      },
    });
  });
});

describe("toJsonSchema", () => {
  it("works", () => {
    const result = justMeta(simpleObj);
    const jsonSchema = metaToJsonSchema(result);

    expect(jsonSchema).toStrictEqual({
      type: "object",
      properties: {
        name: {
          type: "string",
        },
        age: {
          type: "number",
        },
        info: {
          type: "object",
          properties: {
            country: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },
          required: ["country"],
        },
      },
      required: ["age", "info"],
    });

    const ajv = new Ajv();
    // eslint-disable-next-line no-unused-vars -- type-test scaffolding
    const validate = ajv.compile(jsonSchema);

    // expect that it doesn't throw
  });
});
