import { v } from "convex/values";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import {
  convexArgsToJsonSchema,
  convexValidatorToJsonSchema,
  defineHandlerCatalog,
  defineHandlerContract,
  projectHandlerMcpTools,
} from "../src/index";

const createAppResult = v.object({ appId: v.id("apps") });

const createAppContract = defineHandlerContract({
  id: "create_app",
  access: "member",
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
  },
  mcpArgs: {
    owner: v.string(),
    name: v.string(),
    private: v.optional(v.boolean()),
  },
  returns: createAppResult,
  structuredContent: createAppResult,
  mcp: {
    title: "Create app",
    name: "apps_create",
    description: "Create one app.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      owner: "Owner login.",
      name: "App name.",
      private: "Whether the app is private.",
    },
  },
  doc: "Creates one app for the selected owner.",
});

describe("handler contracts", () => {
  it("projects separate frontend and MCP arguments into one tool definition", () => {
    const catalog = defineHandlerCatalog([createAppContract]);
    const tools = projectHandlerMcpTools(catalog);

    expectTypeOf<(typeof tools)[number]["name"]>().toEqualTypeOf<"apps_create">();
    expectTypeOf<(typeof tools)[number]["access"]>().toEqualTypeOf<"member">();

    expect(tools).toEqual([
      {
        contractId: "create_app",
        access: "member",
        title: "Create app",
        name: "apps_create",
        description: "Create one app.",
        safety: "write",
        annotations: {
          readOnlyHint: false,
          openWorldHint: true,
          destructiveHint: false,
        },
        inputSchema: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Owner login." },
            name: { type: "string", description: "App name." },
            private: { type: "boolean", description: "Whether the app is private." },
          },
          required: ["owner", "name"],
          additionalProperties: false,
        },
        outputSchema: {
          type: "object",
          properties: {
            appId: { type: "string" },
          },
          required: ["appId"],
          additionalProperties: false,
        },
      },
    ]);
  });

  it("rejects incomplete descriptions and duplicate catalog keys", () => {
    expect(() => convexArgsToJsonSchema({ name: v.string() }, {})).toThrow(
      "MCP input description is missing for argument: name",
    );
    expect(() => defineHandlerCatalog([createAppContract, createAppContract])).toThrow(
      "Duplicate handler contract ID: create_app",
    );
  });

  it("rejects Convex values that JSON cannot carry", () => {
    expect(() => convexValidatorToJsonSchema(v.int64())).toThrow(
      "Convex int64 values cannot cross the JSON MCP boundary.",
    );
    expect(() => convexValidatorToJsonSchema(v.bytes())).toThrow(
      "Convex bytes values cannot cross the JSON MCP boundary.",
    );
    expect(() => convexValidatorToJsonSchema(v.literal(Number.NaN))).toThrow(
      "Convex non-finite number literals cannot cross the JSON MCP boundary.",
    );
    expect(() => convexValidatorToJsonSchema(v.literal(Number.POSITIVE_INFINITY))).toThrow(
      "Convex non-finite number literals cannot cross the JSON MCP boundary.",
    );
    expect(() =>
      convexValidatorToJsonSchema(
        // @ts-expect-error This simulates a future Convex validator kind at the runtime boundary.
        { kind: "future", isOptional: "required" },
      ),
    ).toThrow("Unsupported Convex validator kind.");
  });
});
