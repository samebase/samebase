import {
  createFinalURL,
  createQuerySerializer,
  defaultPathSerializer,
  type Client,
  type ClientPathsWithMethod,
  type FetchOptions,
  type MethodResponse,
} from "openapi-fetch";
import type { paths } from "./types.generated";
import {
  cloudflareApiResponseValidators,
  type AjvStandaloneValidateFunction,
} from "./validators.generated";
import { callCloudflareMcpTool } from "../cloudflareMcp";
import {
  isRecord,
  readBoolean,
  readString,
  readStringOrNumber,
  toErrorMessage,
} from "../jsonUtils";
import type { ProviderApiCallRecorder } from "../providerApiLog";

const WORKERS_BUILDS_OAUTH_SCOPE_MESSAGE =
  "Cloudflare connection is missing Workers Builds write access. Reconnect Cloudflare and grant Workers Builds, Workers, and Workers Scripts access, then retry.";
const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";

type CloudflareApiRequestMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
export type CloudflareApiTransport = "mcp" | "direct";
export type CloudflareApiAuthMethod = "api_key" | "oauth" | "mcp_oauth";
type CloudflareApiErrorDetail = {
  code?: string;
  message?: string;
};
type CloudflareApiOpenApiClient = Client<paths>;
type CloudflareApiDeletePath = keyof typeof cloudflareApiResponseValidators.DELETE &
  ClientPathsWithMethod<CloudflareApiOpenApiClient, "delete">;
type CloudflareApiGetPath = keyof typeof cloudflareApiResponseValidators.GET &
  ClientPathsWithMethod<CloudflareApiOpenApiClient, "get">;
type CloudflareApiPatchPath = keyof typeof cloudflareApiResponseValidators.PATCH &
  ClientPathsWithMethod<CloudflareApiOpenApiClient, "patch">;
type CloudflareApiPostPath = keyof typeof cloudflareApiResponseValidators.POST &
  ClientPathsWithMethod<CloudflareApiOpenApiClient, "post">;
type CloudflareApiPutPath = keyof typeof cloudflareApiResponseValidators.PUT &
  ClientPathsWithMethod<CloudflareApiOpenApiClient, "put">;
type CloudflareApiParamsOption<Operation> =
  FetchOptions<Operation> extends { params: infer Params }
    ? { params: Params }
    : FetchOptions<Operation> extends { params?: infer Params }
      ? { params?: Params }
      : { params?: never };
type CloudflareApiBodyOption<Operation> =
  FetchOptions<Operation> extends { body: infer Body }
    ? { body: Body }
    : FetchOptions<Operation> extends { body?: infer Body }
      ? { body?: Body }
      : { body?: never };
type CloudflareApiRequestOptions<Operation> = CloudflareApiParamsOption<Operation> &
  CloudflareApiBodyOption<Operation>;
type CloudflareApiDeleteOptions<Path extends CloudflareApiDeletePath> = CloudflareApiRequestOptions<
  NonNullable<paths[Path]["delete"]>
>;
type CloudflareApiGetOptions<Path extends CloudflareApiGetPath> = CloudflareApiRequestOptions<
  NonNullable<paths[Path]["get"]>
>;
type CloudflareApiPatchOptions<Path extends CloudflareApiPatchPath> = CloudflareApiRequestOptions<
  NonNullable<paths[Path]["patch"]>
>;
type CloudflareApiPostOptions<Path extends CloudflareApiPostPath> = CloudflareApiRequestOptions<
  NonNullable<paths[Path]["post"]>
>;
type CloudflareApiPutOptions<Path extends CloudflareApiPutPath> = CloudflareApiRequestOptions<
  NonNullable<paths[Path]["put"]>
>;
type CloudflareApiDeleteJsonResponse<Path extends CloudflareApiDeletePath> = MethodResponse<
  CloudflareApiOpenApiClient,
  "delete",
  Path
>;
type CloudflareApiGetJsonResponse<Path extends CloudflareApiGetPath> = MethodResponse<
  CloudflareApiOpenApiClient,
  "get",
  Path
>;
type CloudflareApiPatchJsonResponse<Path extends CloudflareApiPatchPath> = MethodResponse<
  CloudflareApiOpenApiClient,
  "patch",
  Path
>;
type CloudflareApiPostJsonResponse<Path extends CloudflareApiPostPath> = MethodResponse<
  CloudflareApiOpenApiClient,
  "post",
  Path
>;
type CloudflareApiPutJsonResponse<Path extends CloudflareApiPutPath> = MethodResponse<
  CloudflareApiOpenApiClient,
  "put",
  Path
>;
type CloudflareApiResponseResult<Response> = [Response] extends [never]
  ? void
  : Response extends { result?: infer Result }
    ? Result | undefined
    : void;
type CloudflareApiDeleteResponse<Path extends CloudflareApiDeletePath> =
  CloudflareApiResponseResult<CloudflareApiDeleteJsonResponse<Path>>;
type CloudflareApiGetResponse<Path extends CloudflareApiGetPath> = CloudflareApiResponseResult<
  CloudflareApiGetJsonResponse<Path>
>;
type CloudflareApiPatchResponse<Path extends CloudflareApiPatchPath> = CloudflareApiResponseResult<
  CloudflareApiPatchJsonResponse<Path>
>;
type CloudflareApiPostResponse<Path extends CloudflareApiPostPath> = CloudflareApiResponseResult<
  CloudflareApiPostJsonResponse<Path>
>;
type CloudflareApiPutResponse<Path extends CloudflareApiPutPath> = CloudflareApiResponseResult<
  CloudflareApiPutJsonResponse<Path>
>;
type CloudflareApiDeleteEndpointArgs<Path extends CloudflareApiDeletePath> = {
  method: "DELETE";
  path: Path;
} & Pick<FetchOptions<NonNullable<paths[Path]["delete"]>>, "params">;
type CloudflareApiGetEndpointArgs<Path extends CloudflareApiGetPath> = {
  method: "GET";
  path: Path;
} & Pick<FetchOptions<NonNullable<paths[Path]["get"]>>, "params">;
type CloudflareApiPatchEndpointArgs<Path extends CloudflareApiPatchPath> = {
  method: "PATCH";
  path: Path;
} & Pick<FetchOptions<NonNullable<paths[Path]["patch"]>>, "params">;
type CloudflareApiPostEndpointArgs<Path extends CloudflareApiPostPath> = {
  method: "POST";
  path: Path;
} & Pick<FetchOptions<NonNullable<paths[Path]["post"]>>, "params">;
type CloudflareApiPutEndpointArgs<Path extends CloudflareApiPutPath> = {
  method: "PUT";
  path: Path;
} & Pick<FetchOptions<NonNullable<paths[Path]["put"]>>, "params">;
type CloudflareApiDeleteRequestArgs<Path extends CloudflareApiDeletePath> =
  CloudflareApiRequestBase & {
    method: "DELETE";
    path: Path;
  } & CloudflareApiDeleteOptions<Path>;
type CloudflareApiGetRequestArgs<Path extends CloudflareApiGetPath> = CloudflareApiRequestBase & {
  method: "GET";
  path: Path;
} & CloudflareApiGetOptions<Path>;
type CloudflareApiPatchRequestArgs<Path extends CloudflareApiPatchPath> =
  CloudflareApiRequestBase & {
    method: "PATCH";
    path: Path;
  } & CloudflareApiPatchOptions<Path>;
type CloudflareApiPostRequestArgs<Path extends CloudflareApiPostPath> = CloudflareApiRequestBase & {
  method: "POST";
  path: Path;
} & CloudflareApiPostOptions<Path>;
type CloudflareApiPutRequestArgs<Path extends CloudflareApiPutPath> = CloudflareApiRequestBase & {
  method: "PUT";
  path: Path;
} & CloudflareApiPutOptions<Path>;
type CloudflareApiRequestParams = {
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
};
type CloudflareApiResult =
  | {
      state: "success";
      data: Record<string, unknown>;
    }
  | {
      state: "error";
      error: Record<string, unknown>;
    };
type CloudflareApiRequestBase = {
  token: string;
  transport: CloudflareApiTransport;
  recordApiCall?: ProviderApiCallRecorder;
};

export class CloudflareApiError extends Error {
  readonly method: CloudflareApiRequestMethod;

  readonly path: string;

  readonly details: readonly CloudflareApiErrorDetail[];

  constructor(args: {
    method: CloudflareApiRequestMethod;
    path: string;
    details: readonly CloudflareApiErrorDetail[];
  }) {
    super(
      `Cloudflare API request failed for ${args.method} ${args.path}: ${formatCloudflareApiErrorDetails(args.details)}`,
    );
    this.name = "CloudflareApiError";
    this.method = args.method;
    this.path = args.path;
    this.details = args.details;
  }
}

export function resolveCloudflareApiTransport(
  authMethod: CloudflareApiAuthMethod,
): CloudflareApiTransport {
  switch (authMethod) {
    case "oauth":
      return "direct";
    case "api_key":
    case "mcp_oauth":
      return "mcp";
    default:
      authMethod satisfies never;
      throw new Error("Unsupported Cloudflare auth method.");
  }
}

export function formatCloudflareApiEndpoint<const Path extends CloudflareApiDeletePath>(
  args: CloudflareApiDeleteEndpointArgs<Path>,
): string;
export function formatCloudflareApiEndpoint<const Path extends CloudflareApiGetPath>(
  args: CloudflareApiGetEndpointArgs<Path>,
): string;
export function formatCloudflareApiEndpoint<const Path extends CloudflareApiPatchPath>(
  args: CloudflareApiPatchEndpointArgs<Path>,
): string;
export function formatCloudflareApiEndpoint<const Path extends CloudflareApiPostPath>(
  args: CloudflareApiPostEndpointArgs<Path>,
): string;
export function formatCloudflareApiEndpoint<const Path extends CloudflareApiPutPath>(
  args: CloudflareApiPutEndpointArgs<Path>,
): string;
export function formatCloudflareApiEndpoint(args: {
  method: CloudflareApiRequestMethod;
  path: string;
  params?: CloudflareApiRequestParams;
}): string {
  return formatCloudflareApiEndpointUnchecked(args);
}

function formatCloudflareApiEndpointUnchecked(args: {
  path: string;
  params?: CloudflareApiRequestParams;
}): string {
  return createFinalURL(args.path, {
    baseUrl: "",
    params: args.params ?? {},
    querySerializer: createQuerySerializer(),
    pathSerializer: serializeCloudflareApiPath,
  });
}

/**
 * Sends one OpenAPI-typed Cloudflare request through the selected Cloudflare
 * transport, then validates the JSON envelope for that exact method and path.
 */
export function requestCloudflareApi<const Path extends CloudflareApiDeletePath>(
  args: CloudflareApiDeleteRequestArgs<Path>,
): Promise<CloudflareApiDeleteResponse<Path>>;
export function requestCloudflareApi<const Path extends CloudflareApiGetPath>(
  args: CloudflareApiGetRequestArgs<Path>,
): Promise<CloudflareApiGetResponse<Path>>;
export function requestCloudflareApi<const Path extends CloudflareApiPatchPath>(
  args: CloudflareApiPatchRequestArgs<Path>,
): Promise<CloudflareApiPatchResponse<Path>>;
export function requestCloudflareApi<const Path extends CloudflareApiPostPath>(
  args: CloudflareApiPostRequestArgs<Path>,
): Promise<CloudflareApiPostResponse<Path>>;
export function requestCloudflareApi<const Path extends CloudflareApiPutPath>(
  args: CloudflareApiPutRequestArgs<Path>,
): Promise<CloudflareApiPutResponse<Path>>;
export async function requestCloudflareApi(
  args:
    | (CloudflareApiRequestBase & {
        method: "DELETE";
        path: CloudflareApiDeletePath;
        params?: unknown;
        body?: unknown;
      })
    | (CloudflareApiRequestBase & {
        method: "GET";
        path: CloudflareApiGetPath;
        params?: unknown;
        body?: unknown;
      })
    | (CloudflareApiRequestBase & {
        method: "PATCH";
        path: CloudflareApiPatchPath;
        params?: unknown;
        body?: unknown;
      })
    | (CloudflareApiRequestBase & {
        method: "POST";
        path: CloudflareApiPostPath;
        params?: unknown;
        body?: unknown;
      })
    | (CloudflareApiRequestBase & {
        method: "PUT";
        path: CloudflareApiPutPath;
        params?: unknown;
        body?: unknown;
      }),
): Promise<unknown> {
  const params = readCloudflareApiRequestParams(args);
  if (args.recordApiCall) {
    const values: Record<string, unknown> = {};
    if (params) {
      values.params = params;
    }
    if (args.body !== undefined) {
      values.body = args.body;
    }
    await args.recordApiCall({
      provider: "Cloudflare",
      method: args.method,
      endpoint: args.path,
      values,
    });
  }
  const endpoint = formatCloudflareApiEndpointUnchecked({
    path: args.path,
    params,
  });
  const transport = args.transport;
  const result =
    transport === "direct"
      ? await executeCloudflareApiDirectRequest({
          token: args.token,
          method: args.method,
          endpoint,
          body: args.body,
        })
      : await executeCloudflareApiMcpRequest({
          token: args.token,
          method: args.method,
          endpoint,
          body: args.body,
        });

  switch (args.method) {
    case "DELETE":
      return validateCloudflareApiResult({
        result,
        endpoint,
        method: args.method,
        path: args.path,
        validator: cloudflareApiResponseValidators.DELETE[args.path],
      });
    case "GET":
      return validateCloudflareApiResult({
        result,
        endpoint,
        method: args.method,
        path: args.path,
        validator: cloudflareApiResponseValidators.GET[args.path],
      });
    case "PATCH":
      return validateCloudflareApiResult({
        result,
        endpoint,
        method: args.method,
        path: args.path,
        validator: cloudflareApiResponseValidators.PATCH[args.path],
      });
    case "POST":
      return validateCloudflareApiResult({
        result,
        endpoint,
        method: args.method,
        path: args.path,
        validator: cloudflareApiResponseValidators.POST[args.path],
      });
    case "PUT":
      return validateCloudflareApiResult({
        result,
        endpoint,
        method: args.method,
        path: args.path,
        validator: cloudflareApiResponseValidators.PUT[args.path],
      });
    default:
      args satisfies never;
      throw new Error("Unsupported Cloudflare API method.");
  }
}

export function isWorkersBuildsInvalidTokenMessage(args: {
  path: string;
  message: string;
}): boolean {
  const message = args.message.toLowerCase();
  return (
    isWorkersBuildsApiPath(args.path) &&
    message.includes("12006") &&
    message.includes("invalid token")
  );
}

export function isCloudflareMcpInvalidAccessTokenError(error: unknown): boolean {
  if (error instanceof CloudflareApiError) {
    return error.details.some((detail) => {
      const message = detail.message?.toLowerCase() ?? "";
      return (
        detail.code === "10000" ||
        message.includes("authentication error") ||
        message.includes("invalid api token")
      );
    });
  }
  const message = toErrorMessage(error).toLowerCase();
  return message.includes("invalid_token") || message.includes("invalid access token");
}

function readCloudflareApiRequestParams(options: {
  params?: unknown;
}): CloudflareApiRequestParams | undefined {
  const params = options.params;
  if (params === undefined) {
    return undefined;
  }
  if (!isRecord(params)) {
    throw new Error("Cloudflare API request params must be an object.");
  }
  return {
    path: readOptionalRecordProperty(params, "path"),
    query: readOptionalRecordProperty(params, "query"),
  };
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
  throw new Error(`Cloudflare API request params.${name} must be an object.`);
}

function readCloudflareMcpApiErrorDetail(message: string): CloudflareApiErrorDetail | null {
  const marker = "Cloudflare API error: ";
  const markerIndex = message.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }
  const detail = message.slice(markerIndex + marker.length);
  const codeSeparatorIndex = detail.indexOf(": ");
  if (codeSeparatorIndex === -1) {
    return null;
  }
  const code = detail.slice(0, codeSeparatorIndex).trim();
  if (!/^\d+$/.test(code)) {
    return null;
  }
  const apiMessage = detail.slice(codeSeparatorIndex + 2).trim();
  return apiMessage ? { code, message: apiMessage } : { code };
}

async function executeCloudflareApiMcpRequest(args: {
  token: string;
  method: CloudflareApiRequestMethod;
  endpoint: string;
  body?: unknown;
}): Promise<CloudflareApiResult> {
  const token = args.token.trim();
  if (!token) {
    throw new Error("Cloudflare token is required.");
  }

  const bodyPart = args.body === undefined ? "" : `, body: ${JSON.stringify(args.body)}`;
  const code = `async () => {
  return await cloudflare.request({
    method: ${JSON.stringify(args.method)},
    path: ${JSON.stringify(args.endpoint)}${bodyPart}
  });
}`;
  const text = await callCloudflareMcpTool({
    token,
    toolName: "execute",
    toolArgs: { code },
  }).catch((error: unknown) => {
    const message = toErrorMessage(error);
    if (
      isWorkersBuildsInvalidTokenMessage({
        path: args.endpoint,
        message,
      })
    ) {
      throw new Error(WORKERS_BUILDS_OAUTH_SCOPE_MESSAGE);
    }
    const detail = readCloudflareMcpApiErrorDetail(message);
    if (detail) {
      throw new CloudflareApiError({
        method: args.method,
        path: args.endpoint,
        details: [detail],
      });
    }
    throw error;
  });

  const response = parseCloudflareApiEnvelope({
    endpoint: args.endpoint,
    source: "Cloudflare MCP",
    text,
  });
  if (readBoolean(response, "success") === true) {
    return { state: "success", data: response };
  }

  const details = readCloudflareApiErrorDetails(response["errors"]);
  if (isWorkersBuildsInvalidTokenDetails({ path: args.endpoint, details })) {
    throw new Error(WORKERS_BUILDS_OAUTH_SCOPE_MESSAGE);
  }
  return {
    state: "error",
    error: response,
  };
}

function parseCloudflareApiEnvelope(args: {
  endpoint: string;
  source: string;
  text: string;
}): Record<string, unknown> {
  let payload: unknown;
  try {
    payload = JSON.parse(args.text);
  } catch (error) {
    throw new Error(
      `${args.source} returned non-JSON response for ${args.endpoint}: ${toErrorMessage(error, "parse failed")}`,
    );
  }
  if (isRecord(payload)) {
    return payload;
  }
  throw new Error(`${args.source} returned a non-object response for ${args.endpoint}.`);
}

async function executeCloudflareApiDirectRequest(args: {
  token: string;
  method: CloudflareApiRequestMethod;
  endpoint: string;
  body?: unknown;
}): Promise<CloudflareApiResult> {
  const token = args.token.trim();
  if (!token) {
    throw new Error("Cloudflare token is required.");
  }

  const response = await fetch(`${CLOUDFLARE_API_BASE_URL}${args.endpoint}`, {
    method: args.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(args.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
  });
  const text = await response.text();
  const payload = parseCloudflareApiEnvelope({
    endpoint: args.endpoint,
    source: "Cloudflare API",
    text,
  });
  if (readBoolean(payload, "success") === true) {
    return { state: "success", data: payload };
  }

  const details = readCloudflareApiErrorDetails(payload["errors"]);
  if (isWorkersBuildsInvalidTokenDetails({ path: args.endpoint, details })) {
    throw new Error(WORKERS_BUILDS_OAUTH_SCOPE_MESSAGE);
  }
  if (!response.ok && details.length === 0) {
    throw new Error(
      `Cloudflare API request failed for ${args.method} ${args.endpoint} (${response.status}).`,
    );
  }
  return {
    state: "error",
    error: payload,
  };
}

function validateCloudflareApiResult(args: {
  result: CloudflareApiResult;
  endpoint: string;
  method: CloudflareApiRequestMethod;
  path: string;
  validator: AjvStandaloneValidateFunction<unknown> | null;
}): unknown {
  const schemaName = `${args.method} ${args.path} response`;
  const payload = readCloudflareApiResultData({
    result: args.result,
    endpoint: args.endpoint,
    method: args.method,
  });
  if (args.validator === null) {
    return undefined;
  }

  if (args.validator(payload)) {
    return readCloudflareApiEnvelopeResult(payload);
  }

  const validationErrors = args.validator.errors;
  const formattedErrors =
    validationErrors && validationErrors.length > 0
      ? validationErrors.map((error) => {
          const path = error.instancePath.length > 0 ? error.instancePath : "/";
          const message = error.message ?? "failed validation";
          return `${path} ${message}`;
        })
      : ["unknown validation error"];
  throw new Error(
    `Cloudflare API response for ${args.endpoint} did not match ${schemaName}: ${formattedErrors.join("; ")}`,
  );
}

function readCloudflareApiEnvelopeResult(payload: unknown): unknown {
  if (isRecord(payload) && "result" in payload) {
    return payload.result;
  }
  return undefined;
}

function readCloudflareApiResultData(args: {
  result: CloudflareApiResult;
  endpoint: string;
  method: CloudflareApiRequestMethod;
}): Record<string, unknown> {
  if (args.result.state === "success") {
    return args.result.data;
  }

  throw new CloudflareApiError({
    method: args.method,
    path: args.endpoint,
    details: readCloudflareApiErrorDetails(args.result.error["errors"]),
  });
}

function readCloudflareApiErrorDetails(value: unknown): readonly CloudflareApiErrorDetail[] {
  if (Array.isArray(value)) {
    const details: CloudflareApiErrorDetail[] = [];
    for (const item of value) {
      const detail = readCloudflareApiErrorDetail(item);
      if (detail) {
        details.push(detail);
      }
    }
    return details;
  }

  const detail = readCloudflareApiErrorDetail(value);
  return detail ? [detail] : [];
}

function readCloudflareApiErrorDetail(value: unknown): CloudflareApiErrorDetail | null {
  const record = isRecord(value) ? value : {};
  const code = readStringOrNumber(record, "code");
  const message = readString(record, "message");
  if (!code && !message) {
    return null;
  }
  const detail: CloudflareApiErrorDetail = {};
  if (code) {
    detail.code = code;
  }
  if (message) {
    detail.message = message;
  }
  return detail;
}

function formatCloudflareApiErrorDetails(details: readonly CloudflareApiErrorDetail[]): string {
  if (details.length === 0) {
    return "unknown Cloudflare API error";
  }

  return details
    .map((detail) => {
      const code = detail.code ? `code ${detail.code}` : "unknown code";
      return detail.message ? `${code}: ${detail.message}` : code;
    })
    .join("; ");
}

function isWorkersBuildsInvalidTokenDetails(args: {
  path: string;
  details: readonly CloudflareApiErrorDetail[];
}): boolean {
  return (
    isWorkersBuildsApiPath(args.path) && args.details.some((detail) => detail.code === "12006")
  );
}

function isWorkersBuildsApiPath(path: string): boolean {
  return path.includes("/builds/");
}

function serializeCloudflareApiPath(pathname: string, pathParams: Record<string, unknown>): string {
  const normalizedPathParams: Record<string, unknown> = {};
  const entries: [string, unknown][] = Object.entries(pathParams);
  for (const [name, value] of entries) {
    if (typeof value !== "string") {
      throw new Error(`Cloudflare path parameter ${name} must be a string.`);
    }

    const segment = value.trim();
    if (!segment) {
      throw new Error(`Cloudflare path parameter ${name} is required.`);
    }
    normalizedPathParams[name] = segment;
  }
  return defaultPathSerializer(pathname, normalizedPathParams);
}
