import type { ObjectType, PropertyValidators } from "convex/values";

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

function hasOwnProperty(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function convexJsonValueMatches(json: unknown, value: unknown): boolean {
  if (!isRecord(json)) {
    throw new Error("Convex validator JSON is invalid.");
  }

  const type = readConvexJsonType(json);
  switch (type) {
    case "any":
      return true;
    case "string":
    case "id":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "number":
    case "float64":
      return typeof value === "number";
    case "bigint":
    case "int64":
      return typeof value === "bigint";
    case "null":
      return value === null;
    case "literal":
      return value === json.value;
    case "array":
      return (
        Array.isArray(value) && value.every((item) => convexJsonValueMatches(json.value, item))
      );
    case "object":
      return convexJsonObjectMatches(json.value, value);
    case "record": {
      if (!isRecord(value)) {
        return false;
      }
      if (!isRecord(json.values)) {
        throw new Error("Convex record validator JSON is invalid.");
      }
      const valueType = readConvexObjectFieldType(json.values);
      return Object.values(value).every((item) => convexJsonValueMatches(valueType, item));
    }
    case "union": {
      if (!Array.isArray(json.value)) {
        throw new Error("Convex union validator JSON is invalid.");
      }
      return json.value.some((member) => convexJsonValueMatches(member, value));
    }
    default:
      throw new Error(`Unsupported Convex validator type for runtime parsing: ${type}`);
  }
}

function convexJsonObjectMatches(fields: unknown, value: unknown): boolean {
  if (!isRecord(fields)) {
    throw new Error("Convex object validator JSON is invalid.");
  }
  if (!isRecord(value)) {
    return false;
  }

  const fieldNames = new Set(Object.keys(fields));
  for (const key of Object.keys(value)) {
    if (!fieldNames.has(key)) {
      return false;
    }
  }

  for (const [name, field] of Object.entries(fields)) {
    if (!hasOwnProperty(value, name)) {
      if (isOptionalConvexObjectField(field)) {
        continue;
      }
      return false;
    }
    if (!convexJsonValueMatches(readConvexObjectFieldType(field), value[name])) {
      return false;
    }
  }
  return true;
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

export function parseConvexArgs<Args extends PropertyValidators>(
  args: Args,
  value: unknown,
): { ok: true; value: ObjectType<Args> } | { ok: false } {
  if (!isRecord(value)) {
    return { ok: false };
  }

  const fieldNames = new Set(Object.keys(args));
  for (const key of Object.keys(value)) {
    if (!fieldNames.has(key)) {
      return { ok: false };
    }
  }

  const parsed: Record<string, unknown> = {};
  for (const [name, validator] of Object.entries(args)) {
    if (!hasOwnProperty(value, name)) {
      if (isOptionalConvexValidator(validator)) {
        continue;
      }
      return { ok: false };
    }

    const fieldValue = value[name];
    if (!convexJsonValueMatches(readConvexValidatorJson(validator), fieldValue)) {
      return { ok: false };
    }
    parsed[name] = fieldValue;
  }

  // @ts-expect-error Runtime validation above follows Args metadata, but TypeScript
  // cannot infer ObjectType<Args> from Object.entries(args).
  return { ok: true, value: parsed };
}
