type ConvexRequestMethod = "GET" | "POST";
type NetlifyRequestMethod = "GET" | "POST" | "PATCH" | "DELETE";
type CloudflareRequestMethod = "GET" | "POST" | "PATCH" | "DELETE";
type ProviderName = "Convex" | "Netlify" | "Cloudflare";

export interface ConvexManagementProvider {
  request(path: string, method: ConvexRequestMethod, body?: unknown): Promise<unknown>;
}

export interface NetlifyManagementProvider {
  request(path: string, method: NetlifyRequestMethod, body?: unknown): Promise<unknown>;
}

export interface CloudflareManagementProvider {
  request(
    path: string,
    method: CloudflareRequestMethod,
    body?: unknown,
  ): Promise<unknown>;
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
  method: ConvexRequestMethod | NetlifyRequestMethod | CloudflareRequestMethod;
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
    throw new Error(
      `${args.provider} API request failed (${response.status}) for ${args.path}: ${payloadToString(payload)}`,
    );
  }

  return await parseResponseBody(response);
}

export function createInfraProviders(args?: {
  convexToken?: string;
  netlifyToken?: string;
  cloudflareToken?: string;
}): {
  convex: ConvexManagementProvider;
  netlify: NetlifyManagementProvider;
  cloudflare: CloudflareManagementProvider;
} {
  const convexTokenOverride = args?.convexToken;
  const netlifyTokenOverride = args?.netlifyToken;
  const cloudflareTokenOverride = args?.cloudflareToken;

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
    netlify: {
      request(path, method, body) {
        const token = netlifyTokenOverride ?? getRequiredEnv("NETLIFY_ACCESS_TOKEN");
        return requestProviderApi({
          provider: "Netlify",
          baseUrl: "https://api.netlify.com/api/v1",
          token,
          path,
          method,
          body,
        });
      },
    },
    cloudflare: {
      async request(path, method, body) {
        const token = cloudflareTokenOverride;
        if (!token) {
          throw new Error("Cloudflare access token is required.");
        }
        const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });

        const payload = await parseResponseBody(response);
        const record =
          typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null;
        const success =
          record && typeof record.success === "boolean" ? record.success : response.ok;

        if (!response.ok || !success) {
          const errors = record?.errors ?? record?.messages;
          throw new Error(
            `Cloudflare API request failed (${response.status}) for ${path}: ${payloadToString(
              errors ?? payload,
            )}`,
          );
        }

        if (record && "result" in record) {
          return record.result;
        }
        return payload;
      },
    },
  };
}
