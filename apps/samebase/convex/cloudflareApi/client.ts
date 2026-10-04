import { ValiError, type BaseIssue } from "valibot";
import type { Unsure } from "@samebase/sure";
import { createClient } from "./generated/client/client.gen";
import { callCloudflareMcpTool } from "../cloudflareMcp";
import {
  isRecord,
  readBoolean,
  readString,
  readStringOrNumber,
  toErrorMessage,
} from "../jsonUtils";
import type { ProviderApiCallRecorder } from "../providerApiLog";
import {
  logProviderResponseParseFailure,
  logProviderValidationFailure,
} from "../providerResponseValidation";

const WORKERS_BUILDS_OAUTH_SCOPE_MESSAGE =
  "Cloudflare connection is missing Workers Builds write access. Reconnect Cloudflare and grant Workers Builds, Workers, and Workers Scripts access, then retry.";
const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";
const CLOUDFLARE_API_TIMEOUT_MS = 30_000;

export type CloudflareApiTransport = "mcp" | "direct";
export type CloudflareApiAuthMethod = "api_key" | "oauth" | "mcp_oauth";
type CloudflareApiErrorDetail = { code?: string; message?: string };
type CloudflareApiResponseFailure =
  | readonly BaseIssue<unknown>[]
  | "invalid_json"
  | "non_object_response";
export type CloudflareApiRequestResult<Response> = Unsure<CloudflareApiResponseFailure, Response>;

/** Keeps validation details available to build observations without including provider data in the error message. */
export class CloudflareApiResponseError extends Error {
  readonly #failure: CloudflareApiResponseFailure;

  constructor(method: string, path: string, failure: CloudflareApiResponseFailure) {
    super(`Cloudflare API returned an invalid response for ${method} ${path}.`);
    this.name = "CloudflareApiResponseError";
    this.#failure = failure;
  }

  get failure() {
    return this.#failure;
  }
}

/** Each client owns its credentials and transport. Generated operations own request and response validation. */
export function createCloudflareClient(args: {
  token: string;
  transport: CloudflareApiTransport;
  recordApiCall?: ProviderApiCallRecorder;
}) {
  const token = args.token.trim();
  if (!token) throw new Error("Cloudflare token is required.");

  const client = createClient({
    baseUrl: CLOUDFLARE_API_BASE_URL,
    headers: { Authorization: `Bearer ${token}` },
    parseAs: "json",
    throwOnError: true,
    responseStyle: "data",
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const endpoint = request.url.slice(CLOUDFLARE_API_BASE_URL.length);
      if (args.transport === "mcp") {
        const body = request.body ? await request.text() : undefined;
        const bodyPart = body === undefined ? "" : `, body: ${body}`;
        const code = `async () => {
  return await cloudflare.request({
    method: ${JSON.stringify(request.method)},
    path: ${JSON.stringify(endpoint)}${bodyPart}
  });
}`;
        const text = await callCloudflareMcpTool({
          token,
          toolName: "execute",
          toolArgs: { code },
        }).catch((error: unknown) => {
          const message = toErrorMessage(error);
          if (isWorkersBuildsInvalidTokenMessage({ path: endpoint, message })) {
            throw new Error(WORKERS_BUILDS_OAUTH_SCOPE_MESSAGE);
          }
          const detail = readCloudflareMcpApiErrorDetail(message);
          if (detail)
            throw new CloudflareApiError({
              method: request.method,
              path: endpoint,
              details: [detail],
            });
          throw error;
        });
        return new Response(text || null, { headers: { "Content-Type": "application/json" } });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CLOUDFLARE_API_TIMEOUT_MS);
      try {
        const response = await fetch(request, {
          signal: AbortSignal.any([request.signal, controller.signal]),
        });
        // Read the body before clearing the timer. Fetch alone only waits for headers.
        const text = await response.text();
        return new Response(text || null, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (error) {
        if (controller.signal.aborted)
          throw new Error(`Cloudflare API request timed out after ${CLOUDFLARE_API_TIMEOUT_MS}ms.`);
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
  });

  client.interceptors.request.use(async (request, options) => {
    await args.recordApiCall?.({
      provider: "Cloudflare",
      method: request.method,
      endpoint: options.url,
      values: {
        params: { path: options.path, query: options.query },
        ...(options.body === undefined ? {} : { body: options.body }),
      },
    });
    return request;
  });

  client.interceptors.response.use(async (response, request, options) => {
    // The generated client skips validation for empty bodies.
    if (response.body === null || response.headers.get("Content-Length") === "0")
      throw new CloudflareApiResponseError(request.method, options.url, "invalid_json");

    const validate = options.responseValidator;
    // Check Cloudflare errors before the success schema, using the SDK's parsed payload.
    options.responseValidator = async (payload) => {
      if (!isRecord(payload))
        throw new CloudflareApiResponseError(request.method, options.url, "non_object_response");
      if (response.ok && readBoolean(payload, "success") === true) return await validate?.(payload);

      const endpoint = request.url.slice(CLOUDFLARE_API_BASE_URL.length);
      const details = readCloudflareApiErrorDetails(payload["errors"]);
      if (isWorkersBuildsInvalidTokenDetails({ path: endpoint, details }))
        throw new Error(WORKERS_BUILDS_OAUTH_SCOPE_MESSAGE);
      if (!response.ok && details.length === 0)
        throw new Error(
          `Cloudflare API request failed for ${request.method} ${endpoint} (${response.status}).`,
        );
      throw new CloudflareApiError({ method: request.method, path: endpoint, details });
    };
    if (!response.ok) await options.responseValidator(await response.json());
    return response;
  });

  client.interceptors.error.use((error, response, _request, options) => {
    const method = options.method ?? "GET";
    if (response && error instanceof SyntaxError)
      error = new CloudflareApiResponseError(method, options.url, "invalid_json");
    if (error instanceof ValiError) {
      logProviderValidationFailure({
        provider: "cloudflare",
        phase: response ? "response" : "request",
        method,
        path: options.url,
        transport: args.transport,
        issues: error.issues,
      });
      if (!response)
        return new Error(`Cloudflare API request is invalid for ${method} ${options.url}.`);
      return new CloudflareApiResponseError(method, options.url, error.issues);
    }
    if (error instanceof CloudflareApiResponseError && typeof error.failure === "string") {
      logProviderResponseParseFailure({
        provider: "cloudflare",
        method,
        path: options.url,
        transport: args.transport,
        reason: error.failure,
      });
    }
    return error;
  });
  return client;
}

export class CloudflareApiError extends Error {
  readonly method: string;

  readonly path: string;

  readonly details: readonly CloudflareApiErrorDetail[];

  constructor(args: {
    method: string;
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
    case "api_key":
      return "direct";
    case "mcp_oauth":
      return "mcp";
    default:
      authMethod satisfies never;
      throw new Error("Unsupported Cloudflare auth method.");
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
        detail.code === "9109" ||
        message.includes("authentication error") ||
        message.includes("invalid api token") ||
        message.includes("invalid access token")
      );
    });
  }
  const message = toErrorMessage(error).toLowerCase();
  return message.includes("invalid_token") || message.includes("invalid access token");
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
