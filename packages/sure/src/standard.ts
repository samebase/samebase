import type { MetaNever, MetaObj, Sure } from "./core.ts";

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
type PathBad = readonly [path: readonly PropertyKey[], bad: unknown];

function isPathBad(value: unknown): value is PathBad {
  return Array.isArray(value) && value.length === 2 && Array.isArray(value[0]);
}

function isPathBads(value: unknown): value is readonly PathBad[] {
  return Array.isArray(value) && value.length > 0 && value.every(isPathBad);
}

function isFailureGroup(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Error)
  );
}

function issueFromValue(value: unknown, path: StandardSchemaPath): StandardSchemaV1.Issue {
  const message = value instanceof Error ? value.message : String(value);

  if (path.length) {
    return { message, path };
  }

  return { message };
}

function fallbackIssue(path: StandardSchemaPath): StandardSchemaV1.Issue {
  if (path.length) {
    return { message: "Validation failed", path };
  }

  return { message: "Validation failed" };
}

export function toStandardIssues(
  value: unknown,
  path: StandardSchemaPath = [],
): ReadonlyArray<StandardSchemaV1.Issue> {
  if (isPathBads(value)) {
    return value.flatMap(([itemPath, item]) => toStandardIssues(item, [...path, ...itemPath]));
  }

  if (Array.isArray(value)) {
    const issues = value.flatMap((item, index) =>
      item === undefined ? [] : toStandardIssues(item, [...path, index]),
    );

    return issues.length ? issues : [fallbackIssue(path)];
  }

  if (isFailureGroup(value)) {
    const issues = Object.entries(value).flatMap(([key, item]) =>
      item === undefined ? [] : toStandardIssues(item, [...path, key]),
    );

    return issues.length ? issues : [fallbackIssue(path)];
  }

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

      return { issues: toStandardIssues(result) };
    },
  };

  return Object.assign(schema, { "~standard": standardProperties });
}
