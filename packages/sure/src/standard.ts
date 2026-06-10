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
type StandardReportableSchema = Sure<unknown, unknown, unknown, MetaNever | MetaObj>;

function issue(message: string, path: StandardSchemaPath): StandardSchemaV1.Issue {
  if (path.length) {
    return { message, path };
  }

  return { message };
}

function issueFromValue(value: unknown, path: StandardSchemaPath): StandardSchemaV1.Issue {
  return issue(value instanceof Error ? value.message : String(value), path);
}

function fallbackIssue(path: StandardSchemaPath): StandardSchemaV1.Issue {
  return issue("Validation failed", path);
}

function isReportableSchema(value: unknown): value is StandardReportableSchema {
  return typeof value === "function";
}

function readSchemaMeta(schema: StandardReportableSchema): Record<string, unknown> | null {
  if (!("meta" in schema) || !isObject(schema.meta)) {
    return null;
  }

  return schema.meta;
}

function reportObjectIssues(args: {
  shape: Record<string, unknown>;
  value: unknown;
  input: unknown;
  path: StandardSchemaPath;
}): ReadonlyArray<StandardSchemaV1.Issue> {
  if (!isObject(args.value)) {
    return toStandardIssues(args.value, args.path);
  }

  if (Object.keys(args.value).length === 0) {
    return [issue("not object", args.path)];
  }

  const inputObject: Record<string, unknown> = isObject(args.input) ? args.input : {};
  const issues = Object.entries(args.value).flatMap(([key, childValue]) => {
    const childSchema = args.shape[key];
    const childPath = [...args.path, key];

    if (isReportableSchema(childSchema)) {
      return reportWithSchema({
        schema: childSchema,
        value: childValue,
        input: inputObject[key],
        path: childPath,
      });
    }

    return toStandardIssues(childValue, childPath);
  });

  return issues.length ? issues : [fallbackIssue(args.path)];
}

function reportArrayIssues(args: {
  childSchema: unknown;
  value: unknown;
  input: unknown;
  path: StandardSchemaPath;
}): ReadonlyArray<StandardSchemaV1.Issue> {
  if (!Array.isArray(args.value)) {
    return toStandardIssues(args.value, args.path);
  }

  if (args.value.length === 0) {
    return [issue("not array", args.path)];
  }

  const inputArray = Array.isArray(args.input) ? args.input : [];
  const issues = args.value.flatMap((childValue, index) => {
    if (childValue === undefined) {
      return [];
    }

    const childPath = [...args.path, index];

    if (isReportableSchema(args.childSchema)) {
      return reportWithSchema({
        schema: args.childSchema,
        value: childValue,
        input: inputArray[index],
        path: childPath,
      });
    }

    return toStandardIssues(childValue, childPath);
  });

  return issues.length ? issues : [fallbackIssue(args.path)];
}

function reportTupleIssues(args: {
  tupleSchema: unknown;
  value: unknown;
  input: unknown;
  path: StandardSchemaPath;
}): ReadonlyArray<StandardSchemaV1.Issue> {
  if (!Array.isArray(args.value)) {
    return toStandardIssues(args.value, args.path);
  }

  if (args.value.length === 0) {
    return [issue("not tuple", args.path)];
  }

  const inputArray = Array.isArray(args.input) ? args.input : [];
  const tupleItems = Array.isArray(args.tupleSchema) ? args.tupleSchema : [];
  const issues = args.value.flatMap((childValue, index) => {
    if (childValue === undefined) {
      return [];
    }

    const childSchema = tupleItems[index];
    const childPath = [...args.path, index];

    if (isReportableSchema(childSchema)) {
      return reportWithSchema({
        schema: childSchema,
        value: childValue,
        input: inputArray[index],
        path: childPath,
      });
    }

    return toStandardIssues(childValue, childPath);
  });

  return issues.length ? issues : [fallbackIssue(args.path)];
}

function reportWithSchema(args: {
  schema: StandardReportableSchema;
  value: unknown;
  input: unknown;
  path: StandardSchemaPath;
}): ReadonlyArray<StandardSchemaV1.Issue> {
  // Only schema metadata knows when a bad object or array is a structural failure group.
  // Leaf schemas can still return objects, arrays, null, or undefined as ordinary bad values.
  const meta = readSchemaMeta(args.schema);

  if (meta === null) {
    return toStandardIssues(args.value, args.path);
  }

  if (meta["type"] === "optional") {
    const childSchema = meta["schema"];

    return isReportableSchema(childSchema)
      ? reportWithSchema({ ...args, schema: childSchema })
      : toStandardIssues(args.value, args.path);
  }

  if (meta["type"] === "object") {
    const shape = meta["schema"];

    return isObject(shape)
      ? reportObjectIssues({ ...args, shape })
      : toStandardIssues(args.value, args.path);
  }

  if (meta["type"] === "array") {
    return reportArrayIssues({ ...args, childSchema: meta["schema"] });
  }

  if (meta["type"] === "tuple") {
    return reportTupleIssues({ ...args, tupleSchema: meta["initial"] });
  }

  return toStandardIssues(args.value, args.path);
}

export function toStandardIssues(
  value: unknown,
  path: StandardSchemaPath = [],
): ReadonlyArray<StandardSchemaV1.Issue> {
  return [issueFromValue(value, path)];
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
        issues: reportWithSchema({
          schema,
          value: result,
          input: value,
          path: [],
        }),
      };
    },
  };

  return Object.assign(schema, { "~standard": standardProperties });
}
