import type { GenericValidator, PropertyValidators } from "convex/values";

export type HandlerMcpAnnotations = {
  readOnlyHint: boolean;
  openWorldHint: boolean;
  destructiveHint: boolean;
};

export type HandlerMcpMetadata = {
  title: string;
  name: string;
  description: string;
  safety: "read_only" | "write" | "destructive" | "proposal_only";
  annotations: HandlerMcpAnnotations;
  inputDescriptions: Readonly<Record<string, string>>;
};

export type HandlerContract = {
  readonly id: string;
  readonly access: unknown;
  readonly args: PropertyValidators;
  readonly mcpArgs?: PropertyValidators;
  readonly returns: GenericValidator;
  readonly structuredContent?: GenericValidator;
  readonly mcp: HandlerMcpMetadata;
  readonly doc: string;
};

export type JsonSchema = Readonly<Record<string, unknown>>;

export type ObjectJsonSchema = {
  type: "object";
  properties: Readonly<Record<string, unknown>>;
  required?: string[];
  additionalProperties: false | JsonSchema;
};

export type HandlerMcpTool<Contract extends HandlerContract = HandlerContract> = {
  contractId: Contract["id"];
  access: Contract["access"];
  title: Contract["mcp"]["title"];
  name: Contract["mcp"]["name"];
  description: Contract["mcp"]["description"];
  safety: Contract["mcp"]["safety"];
  annotations: Contract["mcp"]["annotations"];
  inputSchema: ObjectJsonSchema;
  outputSchema?: JsonSchema;
};

export function defineHandlerContract<const Contract extends HandlerContract>(
  contract: Contract,
): Contract {
  return contract;
}

export function convexValidatorToJsonSchema(validator: GenericValidator): JsonSchema {
  switch (validator.kind) {
    case "string":
    case "id":
      return { type: "string" };
    case "boolean":
      return { type: "boolean" };
    case "float64":
      return { type: "number" };
    case "null":
      return { type: "null" };
    case "literal": {
      if (typeof validator.value === "bigint") {
        throw new Error("Convex bigint literals cannot cross the JSON MCP boundary.");
      }
      if (typeof validator.value === "number" && !Number.isFinite(validator.value)) {
        throw new Error("Convex non-finite number literals cannot cross the JSON MCP boundary.");
      }
      return { const: validator.value };
    }
    case "array":
      return {
        type: "array",
        items: convexValidatorToJsonSchema(validator.element),
      };
    case "record":
      return {
        type: "object",
        additionalProperties: convexValidatorToJsonSchema(validator.value),
      };
    case "object": {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [name, field] of Object.entries(validator.fields)) {
        properties[name] = convexValidatorToJsonSchema(field);
        if (field.isOptional !== "optional") {
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
    case "union":
      return {
        anyOf: validator.members.map((member) => convexValidatorToJsonSchema(member)),
      };
    case "any":
    case "bytes":
    case "commitTs":
    case "int64":
      throw new Error(`Convex ${validator.kind} values cannot cross the JSON MCP boundary.`);
    default:
      validator satisfies never;
      throw new Error("Unsupported Convex validator kind.");
  }
}

export function convexArgsToJsonSchema(
  args: PropertyValidators,
  inputDescriptions: Readonly<Record<string, string>>,
): ObjectJsonSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const argumentNames = new Set(Object.keys(args));

  for (const descriptionName of Object.keys(inputDescriptions)) {
    if (!argumentNames.has(descriptionName)) {
      throw new Error(`MCP input description has no matching argument: ${descriptionName}`);
    }
  }

  for (const [name, validator] of Object.entries(args)) {
    const description = inputDescriptions[name];
    if (!description) {
      throw new Error(`MCP input description is missing for argument: ${name}`);
    }

    properties[name] = {
      ...convexValidatorToJsonSchema(validator),
      description,
    };
    if (validator.isOptional !== "optional") {
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

export function projectHandlerMcpTool<const Contract extends HandlerContract>(
  contract: Contract,
): HandlerMcpTool<Contract> {
  return {
    contractId: contract.id,
    access: contract.access,
    title: contract.mcp.title,
    name: contract.mcp.name,
    description: contract.mcp.description,
    safety: contract.mcp.safety,
    annotations: contract.mcp.annotations,
    inputSchema: convexArgsToJsonSchema(
      contract.mcpArgs ?? contract.args,
      contract.mcp.inputDescriptions,
    ),
    ...(contract.structuredContent
      ? { outputSchema: convexValidatorToJsonSchema(contract.structuredContent) }
      : {}),
  };
}

export function defineHandlerCatalog<const Contracts extends readonly HandlerContract[]>(
  contracts: Contracts,
): Contracts {
  const ids = new Set<string>();
  const mcpNames = new Set<string>();

  for (const contract of contracts) {
    if (ids.has(contract.id)) {
      throw new Error(`Duplicate handler contract ID: ${contract.id}`);
    }
    if (mcpNames.has(contract.mcp.name)) {
      throw new Error(`Duplicate MCP tool name: ${contract.mcp.name}`);
    }
    ids.add(contract.id);
    mcpNames.add(contract.mcp.name);
    projectHandlerMcpTool(contract);
  }

  return contracts;
}

export function projectHandlerMcpTools<const Contracts extends readonly HandlerContract[]>(
  contracts: Contracts,
): HandlerMcpTool<Contracts[number]>[] {
  return contracts.map((contract) => projectHandlerMcpTool(contract));
}
