import { isLosslessNumber, isSafeNumber, parse } from "lossless-json";
import { ValiError, type BaseIssue } from "valibot";
import { guard } from "@samebase/dependent/main";
import { createClient } from "./generated/client/index";
import { ConvexManagement } from "./generated/sdk.gen";
import type { PlatformDeploymentResponse, ProjectResponse } from "./generated/types.gen";
import {
  convexManagementResponseDecimalPaths,
  type ConvexManagementResponseDecimalPath,
} from "./responseDecimalPaths.generated";
import { isRecord, toErrorMessage } from "../jsonUtils";
import { ConvexManagementApiError } from "./errors";
import type { ProviderApiCallRecorder } from "../providerApiLog";
import {
  logProviderResponseParseFailure,
  logProviderValidationFailure,
} from "../providerResponseValidation";

const CONVEX_MANAGEMENT_BASE_URL = "https://api.convex.dev/v1";
const CONVEX_MANAGEMENT_TIMEOUT_MS = 10_000;
const decimalPathParameters = new Set(["project_id", "team_id"]);
const responseDecimalPaths = new Map<string, readonly ConvexManagementResponseDecimalPath[]>();
for (const [method, paths] of Object.entries(convexManagementResponseDecimalPaths)) {
  for (const [path, decimalPaths] of Object.entries(paths)) {
    responseDecimalPaths.set(`${method} ${path}`, decimalPaths);
  }
}

export function createConvexManagementClient(args: {
  token: string;
  recordApiCall?: ProviderApiCallRecorder;
}) {
  if (!args.token) throw new Error("Convex access token is required.");
  const client = createClient({
    baseUrl: CONVEX_MANAGEMENT_BASE_URL,
    auth: args.token,
    responseStyle: "data",
    parseAs: "text",
    throwOnError: true,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONVEX_MANAGEMENT_TIMEOUT_MS);
      try {
        const response = await fetch(request, {
          signal: AbortSignal.any([request.signal, controller.signal]),
        });
        const text = await response.text();
        if (!response.ok) {
          throw new ConvexManagementApiError({
            status: response.status,
            path: request.url.slice(CONVEX_MANAGEMENT_BASE_URL.length),
            responseBodySummary: toErrorMessage(text, "No error details returned"),
          });
        }
        return new Response(text || null, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (error) {
        if (controller.signal.aborted) throw new Error("Convex Management API request timed out.");
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
  });

  client.interceptors.request.use(async (request, options) => {
    const method = request.method;
    const path = options.url;
    await args.recordApiCall?.({
      provider: "Convex",
      method,
      endpoint: path,
      values: {
        ...(options.path || options.query
          ? { params: { path: options.path, query: options.query } }
          : {}),
        ...(options.body === undefined ? {} : { body: options.body }),
      },
    });
    if (options.path) {
      const normalizedPath: Record<string, string> = {};
      for (const [name, value] of Object.entries(options.path)) {
        const label = `Convex path parameter ${name}`;
        if (typeof value !== "string") throw new Error(`${label} must be a string.`);
        const segment = readConvexManagementPathSegment(value, label);
        normalizedPath[name] = decimalPathParameters.has(name)
          ? readConvexManagementDecimalValue(segment, label)
          : segment;
      }
      options.path = normalizedPath;
      request = new Request(client.buildUrl(options), request);
    }
    options.parseAs = options.responseValidator ? "json" : "text";
    return request;
  });
  client.interceptors.response.use(async (response, request, options) => {
    if (!options.responseValidator) return response;
    const method = request.method;
    const path = options.url;
    const decimalPaths = responseDecimalPaths.get(`${method} ${path}`);
    if (!decimalPaths)
      throw new Error(`Missing Convex response ID metadata for ${method} ${path}.`);
    if (
      response.body === null ||
      response.status === 204 ||
      response.headers.get("Content-Length") === "0"
    ) {
      throw new ConvexManagementApiResponseError(method, path, "invalid_json");
    }
    const text = await response.text();
    let payload: unknown;
    try {
      payload = parse(text);
    } catch {
      throw new ConvexManagementApiResponseError(method, path, "invalid_json");
    }
    const normalized = normalizeConvexManagementResponseValue({
      decimalPaths,
      path: [],
      value: payload,
    });
    // IDs are strings and other numbers are safe before the SDK parses this JSON.
    return new Response(JSON.stringify(normalized), response);
  });
  client.interceptors.error.use((error, response, _request, options) => {
    const method = options.method ?? "GET";
    if (error instanceof ValiError) {
      logProviderValidationFailure({
        provider: "convex",
        phase: response ? "response" : "request",
        method,
        path: options.url,
        transport: null,
        issues: error.issues,
      });
      if (!response)
        return new Error(`Convex Management API request is invalid for ${method} ${options.url}.`);
      return new ConvexManagementApiResponseError(method, options.url, error.issues);
    }
    if (error instanceof ConvexManagementApiResponseError && error.failure === "invalid_json") {
      logProviderResponseParseFailure({
        provider: "convex",
        method,
        path: options.url,
        transport: null,
        reason: "invalid_json",
      });
    }
    return error;
  });
  return client;
}

export class ConvexManagementApiResponseError extends Error {
  readonly #failure: "invalid_json" | readonly BaseIssue<unknown>[];

  constructor(
    method: string,
    path: string,
    failure: "invalid_json" | readonly BaseIssue<unknown>[],
  ) {
    super(`Convex Management API returned an invalid response for ${method} ${path}.`);
    this.name = "ConvexManagementApiResponseError";
    this.#failure = failure;
  }

  get failure() {
    return this.#failure;
  }
}

export type ConvexCloudDeployment = Extract<PlatformDeploymentResponse, { kind: "cloud" }>;

export const isConvexCloudDeployment = guard<PlatformDeploymentResponse, ConvexCloudDeployment>(
  (deployment) => (deployment.kind === "cloud" ? deployment : null),
);

export async function fetchConvexTeamTokenDetails(token: string): Promise<{
  teamId: string;
}> {
  const details = await ConvexManagement.GET["/token_details"]({
    client: createConvexManagementClient({ token }),
  });
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
  const client = createConvexManagementClient({ token: args.token });
  let cursor: string | undefined;

  for (;;) {
    const page = await ConvexManagement.GET["/teams/{team_id}/projects"]({
      client,
      path: { team_id: args.teamId },
      query: { cursor, limit: 100 },
    });
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
  const client = createConvexManagementClient({ token: args.token });
  let cursor: string | undefined;

  for (;;) {
    const page = await ConvexManagement.GET["/teams/{team_id}/list_deployments"]({
      client,
      path: { team_id: args.teamId },
      query: {
        cursor,
        limit: 100,
        deploymentType: "prod",
        isDefault: true,
      },
    });
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

function normalizeConvexManagementResponseValue(args: {
  decimalPaths: readonly ConvexManagementResponseDecimalPath[];
  path: readonly string[];
  value: unknown;
}): unknown {
  if (isLosslessNumber(args.value)) {
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
