import { z } from "zod";
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

function convexJsonToZod(json: unknown): z.ZodType<unknown> {
  if (!isRecord(json)) {
    throw new Error("Convex validator JSON is invalid.");
  }

  const type = readConvexJsonType(json);
  switch (type) {
    case "string":
    case "id":
      return z.string();
    case "boolean":
      return z.boolean();
    case "number":
    case "float64":
      return z.number();
    case "int64":
      return z.bigint();
    case "null":
      return z.null();
    case "literal": {
      const value = json.value;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return z.literal(value);
      }
      if (value === null) {
        return z.null();
      }
      throw new Error("Convex literal validator JSON is invalid.");
    }
    case "array":
      return z.array(convexJsonToZod(json.value));
    case "object": {
      if (!isRecord(json.value)) {
        throw new Error("Convex object validator JSON is invalid.");
      }

      const shape: Record<string, z.ZodType<unknown>> = {};
      for (const [name, field] of Object.entries(json.value)) {
        const fieldSchema = convexJsonToZod(readConvexObjectFieldType(field));
        shape[name] = isOptionalConvexObjectField(field) ? fieldSchema.optional() : fieldSchema;
      }

      return z.object(shape).strict();
    }
    case "union":
      return z.custom((value) => {
        if (!Array.isArray(json.value)) {
          return false;
        }
        return json.value.some((member) => convexJsonToZod(member).safeParse(value).success);
      });
    default:
      throw new Error(`Unsupported Convex validator type for Zod schema: ${type}`);
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

export function convexArgsToZodSchema<Args extends PropertyValidators>(
  args: Args,
): z.ZodType<ObjectType<Args>> {
  const shape: Record<string, z.ZodType<unknown>> = {};

  for (const [name, validator] of Object.entries(args)) {
    const fieldSchema = convexJsonToZod(readConvexValidatorJson(validator));
    shape[name] = isOptionalConvexValidator(validator) ? fieldSchema.optional() : fieldSchema;
  }

  // @ts-expect-error Dynamic Convex validator metadata builds this shape at runtime,
  // but TypeScript cannot connect Object.entries(args) back to ObjectType<Args>.
  return z.object(shape).strict();
}
