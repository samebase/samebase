import {
  createFinalURL,
  createQuerySerializer,
  defaultPathSerializer,
  type Client,
  type ClientPathsWithMethod,
  type FetchOptions,
  type MaybeOptionalInit,
  type MethodResponse,
} from "openapi-fetch";
import { isLosslessNumber, isSafeNumber, parse } from "lossless-json";
import { guard } from "@samebase/dependent/main";
import { bad, good, pure, type Unsure } from "@samebase/sure";
import type { paths, PlatformDeploymentResponse, ProjectResponse } from "./types.generated";
import {
  convexManagementResponseDecimalPaths,
  convexManagementResponseValidators,
  type AjvStandaloneValidationError,
  type AjvStandaloneValidateFunction,
  type ConvexManagementResponseDecimalPath,
} from "./validators.generated";
import { isRecord, toErrorMessage } from "../jsonUtils";
import { ConvexManagementApiError } from "./errors";
import type { ProviderApiCallRecorder } from "../providerApiLog";
import {
  logProviderResponseParseFailure,
  logProviderResponseValidationFailure,
} from "../providerResponseValidation";

const CONVEX_MANAGEMENT_BASE_URL = "https://api.convex.dev/v1";
const CONVEX_MANAGEMENT_TIMEOUT_MS = 10_000;
const CONVEX_MANAGEMENT_DECIMAL_PATH_PARAMETER_NAMES: ReadonlySet<string> = new Set([
  "project_id",
  "team_id",
]);

type ConvexManagementOpenApiClient = Client<paths>;
type ConvexManagementGetPath = keyof typeof convexManagementResponseValidators.GET &
  ClientPathsWithMethod<ConvexManagementOpenApiClient, "get">;
type ConvexManagementPostPath = keyof typeof convexManagementResponseValidators.POST &
  ClientPathsWithMethod<ConvexManagementOpenApiClient, "post">;
type ConvexManagementParamsOption<Operation> =
  FetchOptions<Operation> extends { params: infer Params }
    ? { params: Params }
    : FetchOptions<Operation> extends { params?: infer Params }
      ? { params?: Params }
      : { params?: never };
type ConvexManagementBodyOption<Operation> =
  FetchOptions<Operation> extends { body: infer Body }
    ? { body: Body }
    : FetchOptions<Operation> extends { body?: infer Body }
      ? { body?: Body }
      : { body?: never };
type ConvexManagementRequestOptions<Operation> = ConvexManagementParamsOption<Operation> &
  ConvexManagementBodyOption<Operation>;
type ConvexManagementApiCallOptions = {
  recordApiCall?: ProviderApiCallRecorder;
};
type ConvexManagementGetOpenApiOptions<Path extends ConvexManagementGetPath> = MaybeOptionalInit<
  paths[Path],
  "get"
>;
type ConvexManagementPostOpenApiOptions<Path extends ConvexManagementPostPath> = MaybeOptionalInit<
  paths[Path],
  "post"
>;
type ConvexManagementGetOptions<Path extends ConvexManagementGetPath> =
  ConvexManagementRequestOptions<NonNullable<paths[Path]["get"]>> & ConvexManagementApiCallOptions;
type ConvexManagementPostOptions<Path extends ConvexManagementPostPath> =
  ConvexManagementRequestOptions<NonNullable<paths[Path]["post"]>> & ConvexManagementApiCallOptions;
type ConvexManagementGetInitParam<Path extends ConvexManagementGetPath> =
  undefined extends ConvexManagementGetOpenApiOptions<Path>
    ? [options?: ConvexManagementGetOptions<Path>]
    : [options: ConvexManagementGetOptions<Path>];
type ConvexManagementPostInitParam<Path extends ConvexManagementPostPath> =
  undefined extends ConvexManagementPostOpenApiOptions<Path>
    ? [options?: ConvexManagementPostOptions<Path>]
    : [options: ConvexManagementPostOptions<Path>];
type ConvexManagementGetJsonResponse<Path extends ConvexManagementGetPath> = MethodResponse<
  ConvexManagementOpenApiClient,
  "get",
  Path
>;
type ConvexManagementPostJsonResponse<Path extends ConvexManagementPostPath> = MethodResponse<
  ConvexManagementOpenApiClient,
  "post",
  Path
>;
type ConvexManagementGetResponse<Path extends ConvexManagementGetPath> = [
  ConvexManagementGetJsonResponse<Path>,
] extends [never]
  ? void
  : ConvexManagementGetJsonResponse<Path>;
type ConvexManagementPostResponse<Path extends ConvexManagementPostPath> = [
  ConvexManagementPostJsonResponse<Path>,
] extends [never]
  ? void
  : ConvexManagementPostJsonResponse<Path>;
export type ConvexManagementApiRequestResult<Response> = Unsure<
  ConvexManagementApiResponseFailure,
  Response
>;
type ConvexManagementApiResponseParseFailure = "invalid_json";
type ConvexManagementApiResponseFailure =
  | readonly AjvStandaloneValidationError[]
  | ConvexManagementApiResponseParseFailure;
type ConvexManagementOpenApiResult<T> =
  | {
      state: "success";
      data: T;
      response: Response;
    }
  | {
      state: "error";
      error: unknown;
      response: Response;
    };
type ConvexManagementRequestParams = {
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
};
type ConvexManagementRequestArgs =
  | [
      method: "GET",
      path: ConvexManagementGetPath,
      options?: { params?: unknown; body?: unknown; recordApiCall?: ProviderApiCallRecorder },
    ]
  | [
      method: "POST",
      path: ConvexManagementPostPath,
      options?: { params?: unknown; body?: unknown; recordApiCall?: ProviderApiCallRecorder },
    ];

export type ConvexCloudDeployment = Extract<PlatformDeploymentResponse, { kind: "cloud" }>;

export const isConvexCloudDeployment = guard<PlatformDeploymentResponse, ConvexCloudDeployment>(
  (deployment) => (deployment.kind === "cloud" ? deployment : null),
);

export async function fetchConvexTeamTokenDetails(token: string): Promise<{
  teamId: string;
}> {
  const details = await requestConvexManagementApiOrThrow(token, "GET", "/token_details");
  if (details.type !== "teamToken") {
    throw new Error("Convex token is missing team access.");
  }
  return { teamId: details.teamId };
}

export async function listConvexManagementProjects(args: {
  token: string;
  teamId: string;
}): Promise<ProjectResponse[]> {
  const projects: ProjectResponse[] = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await requestConvexManagementApiOrThrow(
      args.token,
      "GET",
      "/teams/{team_id}/projects",
      {
        params: {
          path: { team_id: args.teamId },
          query: { cursor, limit: 100 },
        },
      },
    );
    projects.push(...page.items);

    if (!page.pagination.hasMore) {
      return projects;
    }
    if (!page.pagination.nextCursor) {
      throw new Error("Convex project pagination indicated more results without a cursor.");
    }
    cursor = page.pagination.nextCursor;
  }
}

export async function listConvexManagementDefaultProductionDeployments(args: {
  token: string;
  teamId: string;
}): Promise<PlatformDeploymentResponse[]> {
  const deployments: PlatformDeploymentResponse[] = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await requestConvexManagementApiOrThrow(
      args.token,
      "GET",
      "/teams/{team_id}/list_deployments",
      {
        params: {
          path: { team_id: args.teamId },
          query: {
            cursor,
            limit: 100,
            deploymentType: "prod",
            isDefault: true,
          },
        },
      },
    );
    deployments.push(...page.items);

    if (!page.pagination.hasMore) {
      return deployments;
    }
    if (!page.pagination.nextCursor) {
      throw new Error("Convex deployment pagination indicated more results without a cursor.");
    }
    cursor = page.pagination.nextCursor;
  }
}

function formatConvexManagementApiEndpoint(args: {
  path: string;
  params?: ConvexManagementRequestParams;
}): string {
  return createFinalURL(args.path, {
    baseUrl: "",
    params: args.params ?? {},
    querySerializer: createQuerySerializer(),
    pathSerializer: serializeConvexManagementPath,
  });
}

/**
 * Sends one OpenAPI-typed Convex Management request, then validates the JSON
 * response with the generated validator for that exact method and path. It
 * returns every AJV issue as a normal bad value. Endpoints without a JSON
 * response return a good void value.
 */
export function requestConvexManagementApi<const Path extends ConvexManagementGetPath>(
  token: string,
  method: "GET",
  path: Path,
  ...init: ConvexManagementGetInitParam<Path>
): Promise<ConvexManagementApiRequestResult<ConvexManagementGetResponse<Path>>>;
export function requestConvexManagementApi<const Path extends ConvexManagementPostPath>(
  token: string,
  method: "POST",
  path: Path,
  ...init: ConvexManagementPostInitParam<Path>
): Promise<ConvexManagementApiRequestResult<ConvexManagementPostResponse<Path>>>;
export async function requestConvexManagementApi(
  token: string,
  ...request: ConvexManagementRequestArgs
): Promise<ConvexManagementApiRequestResult<unknown>> {
  return await executeValidatedConvexManagementApiRequest(token, ...request);
}

export function requestConvexManagementApiOrThrow<const Path extends ConvexManagementGetPath>(
  token: string,
  method: "GET",
  path: Path,
  ...init: ConvexManagementGetInitParam<Path>
): Promise<ConvexManagementGetResponse<Path>>;
export function requestConvexManagementApiOrThrow<const Path extends ConvexManagementPostPath>(
  token: string,
  method: "POST",
  path: Path,
  ...init: ConvexManagementPostInitParam<Path>
): Promise<ConvexManagementPostResponse<Path>>;
export async function requestConvexManagementApiOrThrow(
  token: string,
  ...request: ConvexManagementRequestArgs
): Promise<unknown> {
  const [valid, result] = await executeValidatedConvexManagementApiRequest(token, ...request);
  if (valid) {
    return result;
  }

  const [method, path] = request;
  throw new Error(`Convex Management API returned an invalid response for ${method} ${path}.`);
}

async function executeValidatedConvexManagementApiRequest(
  token: string,
  ...request: ConvexManagementRequestArgs
): Promise<ConvexManagementApiRequestResult<unknown>> {
  const [method, path, options] = request;
  const params = readConvexManagementRequestParams(options);
  const body = readConvexManagementRequestBody(options);
  const recordApiCall = options?.recordApiCall;
  if (recordApiCall) {
    const values: Record<string, unknown> = {};
    if (params) {
      values["params"] = params;
    }
    if (body !== undefined) {
      values["body"] = body;
    }
    await recordApiCall({
      provider: "Convex",
      method,
      endpoint: path,
      values,
    });
  }
  const endpoint = formatConvexManagementApiEndpoint({
    path,
    params,
  });
  const result = await executeConvexManagementApiRequest({
    token,
    method,
    endpoint,
    body,
  });
  if (method === "GET") {
    return validateConvexManagementResult({
      result,
      endpoint,
      method,
      path,
      decimalPaths: convexManagementResponseDecimalPaths.GET[path],
      validator: convexManagementResponseValidators.GET[path],
    });
  }

  return validateConvexManagementResult({
    result,
    endpoint,
    method,
    path,
    decimalPaths: convexManagementResponseDecimalPaths.POST[path],
    validator: convexManagementResponseValidators.POST[path],
  });
}

function readConvexManagementRequestParams(
  options: { params?: unknown } | undefined,
): ConvexManagementRequestParams | undefined {
  const params = options?.params;
  if (params === undefined) {
    return undefined;
  }
  if (!isRecord(params)) {
    throw new Error("Convex Management API request params must be an object.");
  }
  return {
    path: readOptionalRecordProperty(params, "path"),
    query: readOptionalRecordProperty(params, "query"),
  };
}

function readConvexManagementRequestBody(options: { body?: unknown } | undefined): unknown {
  return options?.body;
}

function readOptionalRecordProperty(
  record: Record<string, unknown>,
  name: string,
): Record<string, unknown> | undefined {
  const value = record[name];
  if (value === undefined) {
    return undefined;
  }
  if (isRecord(value)) {
    return value;
  }
  throw new Error(`Convex Management API request params.${name} must be an object.`);
}

async function executeConvexManagementApiRequest(args: {
  token: string;
  method: "GET" | "POST";
  endpoint: string;
  body?: unknown;
}): Promise<ConvexManagementOpenApiResult<string>> {
  const headers = new Headers({
    Authorization: `Bearer ${readConvexManagementAccessToken(args.token)}`,
  });
  let body: string | undefined;
  if (args.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(args.body);
  }

  const response = await fetchConvexManagementApi(
    new Request(`${CONVEX_MANAGEMENT_BASE_URL}${args.endpoint}`, {
      method: args.method,
      headers,
      body,
    }),
  );
  const text = await response.text();
  if (response.ok) {
    return {
      state: "success",
      data: text,
      response,
    };
  }
  return {
    state: "error",
    error: text,
    response,
  };
}

function readConvexManagementAccessToken(token: string): string {
  if (!token) {
    throw new Error("Convex access token is required.");
  }
  return token;
}

async function fetchConvexManagementApi(input: Request): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, CONVEX_MANAGEMENT_TIMEOUT_MS);

  try {
    return await fetch(input, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Convex Management API request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const validateConvexManagementResult = pure(
  (args: {
    result: ConvexManagementOpenApiResult<string>;
    endpoint: string;
    method: "GET" | "POST";
    path: string;
    decimalPaths: readonly ConvexManagementResponseDecimalPath[];
    validator: AjvStandaloneValidateFunction<unknown> | null;
  }) => {
    const text = readConvexManagementResultData({
      result: args.result,
      endpoint: args.endpoint,
    });
    if (args.validator === null) {
      return good(undefined);
    }

    const [parsed, payload] = parseConvexManagementResponseJson({
      decimalPaths: args.decimalPaths,
      method: args.method,
      path: args.path,
      text,
    });
    if (!parsed) {
      return bad<ConvexManagementApiResponseFailure>(payload);
    }
    if (args.validator(payload)) {
      return good(payload);
    }

    const issues = args.validator.errors ?? [];
    logProviderResponseValidationFailure({
      provider: "convex",
      method: args.method,
      path: args.path,
      transport: null,
      issues,
    });
    return bad<ConvexManagementApiResponseFailure>(issues);
  },
);

const parseConvexManagementResponseJson = pure(
  (args: {
    decimalPaths: readonly ConvexManagementResponseDecimalPath[];
    method: "GET" | "POST";
    path: string;
    text: string;
  }) => {
    let payload: unknown;
    try {
      payload = parse(args.text);
    } catch {
      logProviderResponseParseFailure({
        provider: "convex",
        method: args.method,
        path: args.path,
        transport: null,
        reason: "invalid_json",
      });
      return bad("invalid_json" as const);
    }

    return good(
      normalizeConvexManagementResponseValue({
        decimalPaths: args.decimalPaths,
        path: [],
        value: payload,
      }),
    );
  },
);

function normalizeConvexManagementResponseValue(args: {
  decimalPaths: readonly ConvexManagementResponseDecimalPath[];
  path: readonly string[];
  value: unknown;
}): unknown {
  if (isLosslessNumber(args.value)) {
    return normalizeConvexManagementResponseNumber(args);
  }

  if (Array.isArray(args.value)) {
    return args.value.map((value) =>
      normalizeConvexManagementResponseValue({
        ...args,
        path: [...args.path, "*"],
        value,
      }),
    );
  }

  if (isRecord(args.value)) {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args.value)) {
      normalized[key] = normalizeConvexManagementResponseValue({
        ...args,
        path: [...args.path, key],
        value,
      });
    }
    return normalized;
  }

  return args.value;
}

function normalizeConvexManagementResponseNumber(args: {
  decimalPaths: readonly ConvexManagementResponseDecimalPath[];
  path: readonly string[];
  value: unknown;
}): number | string {
  if (!isLosslessNumber(args.value)) {
    throw new Error("Convex response number normalizer received a non-number value.");
  }

  const serialized = args.value.toString();
  const pathLabel = formatConvexManagementResponsePath(args.path);
  if (isConvexManagementDecimalResponsePath(args.path, args.decimalPaths)) {
    return readConvexManagementDecimalValue(serialized, pathLabel);
  }

  if (!isSafeNumber(serialized, { approx: false })) {
    throw new Error(`${pathLabel} is outside JavaScript's safe numeric range.`);
  }
  return Number(serialized);
}

function isConvexManagementDecimalResponsePath(
  path: readonly string[],
  decimalPaths: readonly ConvexManagementResponseDecimalPath[],
): boolean {
  return decimalPaths.some(
    (decimalPath) =>
      decimalPath.length === path.length &&
      decimalPath.every((segment, index) => segment === "*" || segment === path[index]),
  );
}

function formatConvexManagementResponsePath(path: readonly string[]): string {
  if (path.length === 0) {
    return "Convex response number";
  }
  return `Convex response field /${path.join("/")}`;
}

function readConvexManagementResultData(args: {
  result: ConvexManagementOpenApiResult<string>;
  endpoint: string;
}): string {
  if (args.result.state === "success") {
    return args.result.data;
  }

  throw new ConvexManagementApiError({
    status: args.result.response.status,
    path: args.endpoint,
    responseBodySummary: toErrorMessage(args.result.error, "No error details returned"),
  });
}

function serializeConvexManagementPath(
  pathname: string,
  pathParams: Record<string, unknown>,
): string {
  const normalizedPathParams: Record<string, unknown> = {};
  const entries: [string, unknown][] = Object.entries(pathParams);
  for (const [name, value] of entries) {
    if (typeof value !== "string") {
      throw new Error(`Convex path parameter ${name} must be a string.`);
    }

    const label = `Convex path parameter ${name}`;
    const segment = readConvexManagementPathSegment(value, label);
    normalizedPathParams[name] = CONVEX_MANAGEMENT_DECIMAL_PATH_PARAMETER_NAMES.has(name)
      ? readConvexManagementDecimalValue(segment, label)
      : segment;
  }
  return defaultPathSerializer(pathname, normalizedPathParams);
}

function readConvexManagementPathSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized !== value) {
    console.warn("convex:api:trimmed_path_parameter", {
      label,
      originalLength: value.length,
      normalizedLength: normalized.length,
    });
  }
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function readConvexManagementDecimalValue(value: string, label: string): string {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a decimal identifier.`);
  }
  return value;
}
