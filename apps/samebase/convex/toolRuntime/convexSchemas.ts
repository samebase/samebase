import type { PropertyValidators } from "convex/values";

import { isRecord } from "../jsonUtils";
import type { ToolJsonSchema } from "./types";

function readConvexValidatorJson(validator: unknown) {
  if (!isRecord(validator) || !isRecord(validator.json)) {
    throw new Error("Convex validator metadata is missing.");
  }
  return validator.json;
}

function isOptionalConvexValidator(validator: unknown): boolean {
  return isRecord(validator) && validator.isOptional === "optional";
}

function withDescription(schema: Record<string, unknown>, description: string | undefined) {
  if (description === undefined) {
    return schema;
  }
  return {
    ...schema,
    description,
  };
}

function readConvexObjectFieldType(field: unknown): unknown {
  if (!isRecord(field)) {
    throw new Error("Convex object field metadata is invalid.");
  }
  return field.fieldType;
}

function isOptionalConvexObjectField(field: unknown): boolean {
  return isRecord(field) && field.optional === true;
}

function readConvexJsonType(json: Record<string, unknown>): string {
  if (typeof json.type !== "string") {
    throw new Error("Convex validator JSON type is missing.");
  }
  return json.type;
}

function convexJsonToToolJsonSchema(json: unknown): Record<string, unknown> {
  if (!isRecord(json)) {
    throw new Error("Convex validator JSON is invalid.");
  }

  const type = readConvexJsonType(json);
  switch (type) {
    case "string":
    case "id":
      return { type: "string" };
    case "boolean":
      return { type: "boolean" };
    case "number":
    case "float64":
      return { type: "number" };
    case "bigint":
    case "int64":
      return { type: "integer" };
    case "null":
      return { type: "null" };
    case "literal":
      return { const: json.value };
    case "array":
      return {
        type: "array",
        items: convexJsonToToolJsonSchema(json.value),
      };
    case "record": {
      if (!isRecord(json.values)) {
        throw new Error("Convex record validator JSON is invalid.");
      }
      return {
        type: "object",
        additionalProperties: convexJsonToToolJsonSchema(readConvexObjectFieldType(json.values)),
      };
    }
    case "object": {
      if (!isRecord(json.value)) {
        throw new Error("Convex object validator JSON is invalid.");
      }

      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [name, field] of Object.entries(json.value)) {
        properties[name] = convexJsonToToolJsonSchema(readConvexObjectFieldType(field));
        if (!isOptionalConvexObjectField(field)) {
          required.push(name);
        }
      }

      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      };
    }
    case "union": {
      if (!Array.isArray(json.value)) {
        throw new Error("Convex union validator JSON is invalid.");
      }
      const members = json.value.map((member) => convexJsonToToolJsonSchema(member));
      return { anyOf: members };
    }
    default:
      throw new Error(`Unsupported Convex validator type for MCP schema: ${type}`);
  }
}

export function convexArgsToToolInputSchema(
  args: PropertyValidators,
  argsDescriptions?: Record<string, string>,
) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, validator] of Object.entries(args)) {
    properties[name] = withDescription(
      convexJsonToToolJsonSchema(readConvexValidatorJson(validator)),
      argsDescriptions?.[name],
    );
    if (!isOptionalConvexValidator(validator)) {
      required.push(name);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  } satisfies ToolJsonSchema;
}
