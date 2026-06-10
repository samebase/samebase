import type { MetaNever, MetaObj, Sure } from "./core.ts";
import { isObject } from "./object.ts";

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: Types<Input, Output> | undefined;
    readonly validate: (
      value: unknown,
      options?: Options,
    ) => Result<Output> | Promise<Result<Output>>;
  }

  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }

  export type Result<Output> = SuccessResult<Output> | FailureResult;

  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }

  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  export interface PathSegment {
    readonly key: PropertyKey;
  }

  export interface Options {
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }
}

type StandardSchemaPath = NonNullable<StandardSchemaV1.Issue["path"]>;

function leafIssues(
  value: unknown,
  path: StandardSchemaPath = [],
): ReadonlyArray<StandardSchemaV1.Issue> {
  return [{ message: String(value), path }];
}

function issuesFor(
  schema: unknown,
  value: unknown,
  input: unknown,
  path: StandardSchemaPath = [],
): ReadonlyArray<StandardSchemaV1.Issue> {
  if (typeof schema !== "function") {
    return leafIssues(value, path);
  }

  const meta = "meta" in schema && isObject(schema.meta) ? schema.meta : undefined;

  if (!meta) {
    return leafIssues(value, path);
  }

  const schemaMeta = meta["schema"];

  if (meta["type"] === "optional") {
    return issuesFor(schemaMeta, value, input, path);
  }

  if (meta["type"] === "object" && isObject(schemaMeta) && isObject(value)) {
    if (Object.keys(value).length === 0) {
      return leafIssues("not object", path);
    }

    const inputObject: Record<string, unknown> = isObject(input) ? input : {};
    const issues: StandardSchemaV1.Issue[] = [];

    for (const [key, badValue] of Object.entries(value)) {
      const childPath = [...path, key];
      const childSchema = schemaMeta[key];

      issues.push(...issuesFor(childSchema, badValue, inputObject[key], childPath));
    }

    return issues;
  }

  if (meta["type"] === "array" && typeof schemaMeta === "function" && Array.isArray(value)) {
    if (value.length === 0) {
      return leafIssues("not array", path);
    }

    const inputArray = Array.isArray(input) ? input : [];
    const issues: StandardSchemaV1.Issue[] = [];

    for (const [key, badValue] of value.entries()) {
      const childPath = [...path, key];

      if (badValue !== undefined) {
        issues.push(...issuesFor(schemaMeta, badValue, inputArray[key], childPath));
        continue;
      }

      const [good, unsure] = schemaMeta(inputArray[key]);

      if (!good) {
        issues.push(...issuesFor(schemaMeta, unsure, inputArray[key], childPath));
      }
    }

    return issues;
  }

  const initial = meta["initial"];

  if (meta["type"] === "tuple" && Array.isArray(initial) && Array.isArray(value)) {
    if (value.length === 0) {
      return leafIssues("not tuple", path);
    }

    const inputArray = Array.isArray(input) ? input : [];
    const issues: StandardSchemaV1.Issue[] = [];

    for (const [key, badValue] of value.entries()) {
      const childPath = [...path, key];
      const childSchema = initial[key];

      if (badValue !== undefined) {
        issues.push(...issuesFor(childSchema, badValue, inputArray[key], childPath));
        continue;
      }

      if (typeof childSchema !== "function") {
        continue;
      }

      const [good, unsure] = childSchema(inputArray[key]);

      if (!good) {
        issues.push(...issuesFor(childSchema, unsure, inputArray[key], childPath));
      }
    }

    return issues;
  }

  return leafIssues(value, path);
}

export function standard<TBad, TGood, TMeta extends MetaNever | MetaObj>(
  schema: Sure<TBad, TGood, unknown, TMeta>,
): Sure<TBad, TGood, unknown, TMeta> & StandardSchemaV1<unknown, TGood> {
  const standardProperties: StandardSchemaV1.Props<unknown, TGood> = {
    version: 1,
    vendor: "@samebase/sure",
    validate: (value) => {
      const [valid, result] = schema(value);

      if (valid) {
        return { value: result };
      }

      return {
        issues: issuesFor(schema, result, value),
      };
    },
  };

  return Object.assign(schema, { "~standard": standardProperties });
}
