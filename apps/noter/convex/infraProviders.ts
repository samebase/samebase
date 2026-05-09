type ConvexRequestMethod = "GET" | "POST";
type ProviderName = "Convex";

export interface ConvexManagementProvider {
  request(
    path: string,
    method: ConvexRequestMethod,
    body?: unknown,
  ): Promise<unknown>;
}

export class ConvexManagementApiError extends Error {
  readonly status: number;

  readonly path: string;

  readonly payload: unknown;

  constructor(args: { status: number; path: string; payload: unknown }) {
    super(
      `Convex API request failed (${args.status}) for ${args.path}: ${payloadToString(args.payload)}`,
    );
    this.name = "ConvexManagementApiError";
    this.status = args.status;
    this.path = args.path;
    this.payload = args.payload;
  }
}

export function isConvexManagementNotFoundError(error: unknown): boolean {
  return error instanceof ConvexManagementApiError && error.status === 404;
}

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

function payloadToString(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

async function requestProviderApi(args: {
  provider: ProviderName;
  baseUrl: string;
  token: string;
  path: string;
  method: ConvexRequestMethod;
  body?: unknown;
}): Promise<unknown> {
  const response = await fetch(`${args.baseUrl}${args.path}`, {
    method: args.method,
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
    },
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
  });

  if (!response.ok) {
    const payload = await parseResponseBody(response);
    throw new ConvexManagementApiError({
      status: response.status,
      path: args.path,
      payload,
    });
  }

  return await parseResponseBody(response);
}

export function createInfraProviders(args?: { convexToken?: string }): {
  convex: ConvexManagementProvider;
} {
  const convexTokenOverride = args?.convexToken;

  return {
    convex: {
      request(path, method, body) {
        const token = convexTokenOverride;
        if (!token) {
          throw new Error("Convex access token is required.");
        }
        return requestProviderApi({
          provider: "Convex",
          baseUrl: "https://api.convex.dev/v1",
          token,
          path,
          method,
          body,
        });
      },
    },
  };
}
