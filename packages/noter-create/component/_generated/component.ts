/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    providerConnections: {
      createOauthState: FunctionReference<
        "mutation",
        "internal",
        {
          clientId?: string;
          clientSecret?: string;
          codeVerifier?: string;
          createdAt: number;
          expiresAt: number;
          provider: "github" | "convex" | "cloudflare_mcp";
          returnToPath?: string;
          state: string;
          userId: string;
        },
        string,
        Name
      >;
      deleteByUserAndKind: FunctionReference<
        "mutation",
        "internal",
        { kind: "github" | "convex" | "cloudflare"; userId: string },
        null,
        Name
      >;
      deleteOauthState: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        null,
        Name
      >;
      getByUserAndKind: FunctionReference<
        "query",
        "internal",
        { kind: "github" | "convex" | "cloudflare"; userId: string },
        | {
            _creationTime: number;
            _id: string;
            auth:
              | {
                  credential: string;
                  credentialExpiresAt?: number;
                  method: "oauth";
                  refreshCredential?: string;
                }
              | {
                  credential: string;
                  credentialExpiresAt?: number;
                  method: "api_key";
                };
            createdAt: number;
            kind: "github";
            updatedAt: number;
            userId: string;
            username?: string;
          }
        | {
            _creationTime: number;
            _id: string;
            auth:
              | {
                  credential: string;
                  credentialExpiresAt?: number;
                  method: "oauth";
                  refreshCredential?: string;
                }
              | {
                  credential: string;
                  credentialExpiresAt?: number;
                  method: "api_key";
                };
            createdAt: number;
            kind: "convex";
            teamId: string;
            teamSlug?: string;
            updatedAt: number;
            userId: string;
          }
        | {
            _creationTime: number;
            _id: string;
            accountId?: string;
            auth:
              | {
                  clientId?: string;
                  credential: string;
                  credentialExpiresAt?: number;
                  mcpServerUrl: string;
                  method: "mcp_oauth";
                  refreshCredential?: string;
                }
              | {
                  credential: string;
                  credentialExpiresAt?: number;
                  method: "api_key";
                };
            createdAt: number;
            kind: "cloudflare";
            lastTokenRefreshAt?: number;
            tokenHealth?: {
              checkedAt: number;
              errorMessage?: string;
              expiresAt?: number;
              source:
                | "expiry_metadata"
                | "refresh_attempt"
                | "active_probe"
                | "runtime_error";
              status:
                | "valid"
                | "expiring_soon"
                | "expired"
                | "invalid"
                | "unknown";
            };
            tokenRefreshStartedAt?: number;
            updatedAt: number;
            userId: string;
          }
        | null,
        Name
      >;
      getCreateAvailability: FunctionReference<
        "query",
        "internal",
        { userId: string },
        {
          cloudflareConnected: boolean;
          convexConnected: boolean;
          githubConnected: boolean;
        },
        Name
      >;
      getOauthStateByState: FunctionReference<
        "query",
        "internal",
        { provider: "github" | "convex" | "cloudflare_mcp"; state: string },
        {
          _creationTime: number;
          _id: string;
          clientId?: string;
          clientSecret?: string;
          codeVerifier?: string;
          createdAt: number;
          expiresAt: number;
          provider: "github" | "convex" | "cloudflare_mcp";
          returnToPath?: string;
          state: string;
          userId: string;
        } | null,
        Name
      >;
      listByUser: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<
          | {
              _creationTime: number;
              _id: string;
              auth:
                | {
                    credential: string;
                    credentialExpiresAt?: number;
                    method: "oauth";
                    refreshCredential?: string;
                  }
                | {
                    credential: string;
                    credentialExpiresAt?: number;
                    method: "api_key";
                  };
              createdAt: number;
              kind: "github";
              updatedAt: number;
              userId: string;
              username?: string;
            }
          | {
              _creationTime: number;
              _id: string;
              auth:
                | {
                    credential: string;
                    credentialExpiresAt?: number;
                    method: "oauth";
                    refreshCredential?: string;
                  }
                | {
                    credential: string;
                    credentialExpiresAt?: number;
                    method: "api_key";
                  };
              createdAt: number;
              kind: "convex";
              teamId: string;
              teamSlug?: string;
              updatedAt: number;
              userId: string;
            }
          | {
              _creationTime: number;
              _id: string;
              accountId?: string;
              auth:
                | {
                    clientId?: string;
                    credential: string;
                    credentialExpiresAt?: number;
                    mcpServerUrl: string;
                    method: "mcp_oauth";
                    refreshCredential?: string;
                  }
                | {
                    credential: string;
                    credentialExpiresAt?: number;
                    method: "api_key";
                  };
              createdAt: number;
              kind: "cloudflare";
              lastTokenRefreshAt?: number;
              tokenHealth?: {
                checkedAt: number;
                errorMessage?: string;
                expiresAt?: number;
                source:
                  | "expiry_metadata"
                  | "refresh_attempt"
                  | "active_probe"
                  | "runtime_error";
                status:
                  | "valid"
                  | "expiring_soon"
                  | "expired"
                  | "invalid"
                  | "unknown";
              };
              tokenRefreshStartedAt?: number;
              updatedAt: number;
              userId: string;
            }
        >,
        Name
      >;
      upsertCloudflare: FunctionReference<
        "mutation",
        "internal",
        {
          accountId?: string;
          auth:
            | {
                clientId?: string;
                credential: string;
                credentialExpiresAt?: number;
                mcpServerUrl: string;
                method: "mcp_oauth";
                refreshCredential?: string;
              }
            | {
                credential: string;
                credentialExpiresAt?: number;
                method: "api_key";
              };
          lastTokenRefreshAt?: number;
          tokenHealth?: {
            checkedAt: number;
            errorMessage?: string;
            expiresAt?: number;
            source:
              | "expiry_metadata"
              | "refresh_attempt"
              | "active_probe"
              | "runtime_error";
            status:
              | "valid"
              | "expiring_soon"
              | "expired"
              | "invalid"
              | "unknown";
          };
          tokenRefreshStartedAt?: number;
          userId: string;
        },
        null,
        Name
      >;
      upsertConvex: FunctionReference<
        "mutation",
        "internal",
        {
          auth:
            | {
                credential: string;
                credentialExpiresAt?: number;
                method: "oauth";
                refreshCredential?: string;
              }
            | {
                credential: string;
                credentialExpiresAt?: number;
                method: "api_key";
              };
          teamId: string;
          teamSlug?: string;
          userId: string;
        },
        null,
        Name
      >;
      upsertGithub: FunctionReference<
        "mutation",
        "internal",
        {
          auth:
            | {
                credential: string;
                credentialExpiresAt?: number;
                method: "oauth";
                refreshCredential?: string;
              }
            | {
                credential: string;
                credentialExpiresAt?: number;
                method: "api_key";
              };
          userId: string;
          username?: string;
        },
        null,
        Name
      >;
    };
  };
