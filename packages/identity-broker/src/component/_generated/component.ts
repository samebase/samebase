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
    apps: {
      create: FunctionReference<
        "mutation",
        "internal",
        { appId: string; createdAt: number; firstParty: boolean; name: string },
        null,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { appId: string },
        {
          appId: string;
          connector?: string;
          createdAt: number;
          firstParty: boolean;
          name: string;
          suspended: boolean;
          tenantId?: string;
        } | null,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          appId: string;
          connector?: string;
          createdAt: number;
          firstParty: boolean;
          name: string;
          suspended: boolean;
          tenantId?: string;
        }>,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { appId: string },
        null,
        Name
      >;
    };
    authRequests: {
      abandon: FunctionReference<
        "mutation",
        "internal",
        { requestId: string },
        { redirectUri: string; state?: string } | null,
        Name
      >;
      claimUpstream: FunctionReference<
        "mutation",
        "internal",
        {
          connector: string;
          now: number;
          txnCookieHashes: Array<string>;
          upstreamStateHash: string;
        },
        | {
            connector: string;
            createdAt: number;
            freshLogin: boolean;
            redirectUri: string;
            requestId: string;
            state?: string;
            status: "claimed";
            upstreamCodeVerifier: string;
            upstreamNonce?: string;
          }
        | {
            redirectUri: string;
            requestId: string;
            state?: string;
            status: "expired";
          }
        | { status: "unbound" }
        | { status: "missing" },
        Name
      >;
      complete: FunctionReference<
        "mutation",
        "internal",
        {
          authTime: number;
          codeExpiresAt: number;
          codeHash: string;
          identity: {
            connector: string;
            email?: string;
            emailVerified?: boolean;
            name?: string;
            picture?: string;
            upstreamId: string;
          };
          now: number;
          requestId: string;
        },
        | { ok: true; redirectUri: string; state?: string }
        | {
            error: "expired" | "wrong_status";
            ok: false;
            redirectUri: string;
            state?: string;
          }
        | { error: "not_found"; ok: false },
        Name
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          appId: string;
          clientId: string;
          codeChallenge: string;
          createdAt: number;
          expiresAt: number;
          freshLogin: boolean;
          nonce?: string;
          redirectUri: string;
          requestId: string;
          scope: string;
          state?: string;
          tenantId?: string;
          txnCookieHash: string;
        },
        { ok: boolean },
        Name
      >;
      exchangeCode: FunctionReference<
        "mutation",
        "internal",
        {
          clientId: string;
          clientSecretHash: string;
          codeHash: string;
          codeVerifier: string;
          now: number;
          redirectUri?: string;
          tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
        },
        | {
            appId: string;
            authTime: number;
            clientId: string;
            firstParty: boolean;
            identity: {
              connector: string;
              email?: string;
              emailVerified?: boolean;
              name?: string;
              picture?: string;
              upstreamId: string;
            };
            nonce?: string;
            ok: true;
            scope: string;
            tenantId?: string;
          }
        | {
            description: string;
            error: "invalid_client" | "invalid_grant";
            ok: false;
          },
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { requestId: string },
        | {
            appId: string;
            clientId: string;
            codeChallenge: string;
            createdAt: number;
            expiresAt: number;
            freshLogin: boolean;
            nonce?: string;
            redirectUri: string;
            requestId: string;
            scope: string;
            state?: string;
            status: "pending";
            txnCookieHash: string;
          }
        | {
            appId: string;
            clientId: string;
            codeChallenge: string;
            connector: string;
            createdAt: number;
            expiresAt: number;
            freshLogin: boolean;
            nonce?: string;
            redirectUri: string;
            requestId: string;
            scope: string;
            state?: string;
            status: "upstream";
            txnCookieHash: string;
            upstreamCodeVerifier: string;
            upstreamNonce?: string;
            upstreamStateHash: string;
          }
        | {
            appId: string;
            clientId: string;
            codeChallenge: string;
            connector: string;
            createdAt: number;
            expiresAt: number;
            freshLogin: boolean;
            nonce?: string;
            redirectUri: string;
            requestId: string;
            scope: string;
            state?: string;
            status: "claimed";
            txnCookieHash: string;
          }
        | {
            appId: string;
            authTime: number;
            clientId: string;
            codeChallenge: string;
            createdAt: number;
            expiresAt: number;
            freshLogin: boolean;
            identity: {
              connector: string;
              email?: string;
              emailVerified?: boolean;
              name?: string;
              picture?: string;
              upstreamId: string;
            };
            nonce?: string;
            redirectUri: string;
            requestId: string;
            scope: string;
            state?: string;
            status: "completed";
            txnCookieHash: string;
          }
        | null,
        Name
      >;
      startUpstream: FunctionReference<
        "mutation",
        "internal",
        {
          connector: string;
          now: number;
          requestId: string;
          upstreamCodeVerifier: string;
          upstreamNonce?: string;
          upstreamStateHash: string;
        },
        | { ok: true; redirectUri: string; state?: string }
        | {
            error: "expired" | "wrong_status";
            ok: false;
            redirectUri: string;
            state?: string;
          }
        | { error: "not_found"; ok: false },
        Name
      >;
    };
    clients: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          appId: string;
          clientId: string;
          clientName: string;
          createdAt: number;
          deploymentType: "production" | "development" | "preview";
          redirectUri: string;
          secretHash: string;
          softwareVersion: string;
          tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
        },
        null,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { clientId: string },
        {
          appId: string;
          clientId: string;
          clientName: string;
          createdAt: number;
          deploymentType: "production" | "development" | "preview";
          lastSignInAt?: number;
          redirectUri: string;
          registrationTokenHash?: string;
          removeAt?: number;
          renewedAt?: number;
          secretHash: string;
          softwareVersion: string;
          tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
        } | null,
        Name
      >;
      listByApp: FunctionReference<
        "query",
        "internal",
        { appId: string },
        Array<{
          appId: string;
          clientId: string;
          clientName: string;
          createdAt: number;
          deploymentType: "production" | "development" | "preview";
          lastSignInAt?: number;
          redirectUri: string;
          registrationTokenHash?: string;
          removeAt?: number;
          renewedAt?: number;
          secretHash: string;
          softwareVersion: string;
          tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
        }>,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { clientId: string },
        null,
        Name
      >;
      withApp: FunctionReference<
        "query",
        "internal",
        { clientId: string },
        {
          app: {
            appId: string;
            connector?: string;
            createdAt: number;
            firstParty: boolean;
            name: string;
            suspended: boolean;
            tenantId?: string;
          } | null;
          client: {
            appId: string;
            clientId: string;
            clientName: string;
            createdAt: number;
            deploymentType: "production" | "development" | "preview";
            lastSignInAt?: number;
            redirectUri: string;
            registrationTokenHash?: string;
            removeAt?: number;
            renewedAt?: number;
            secretHash: string;
            softwareVersion: string;
            tokenEndpointAuthMethod:
              "client_secret_post" | "client_secret_basic";
          };
        } | null,
        Name
      >;
    };
    lifecycle: {
      cleanup: FunctionReference<
        "mutation",
        "internal",
        {
          now: number;
          previewClientMaxAgeMs?: number;
          signInRetentionMs: number;
        },
        {
          authRequests: number;
          authorizationCodes: number;
          expiredClients: number;
          previewClients: number;
          signIns: number;
        },
        Name
      >;
    };
    registration: {
      register: FunctionReference<
        "mutation",
        "internal",
        {
          appId: string;
          clientId: string;
          clientName: string;
          connector: string;
          deploymentType: "production" | "preview";
          now: number;
          redirectUri: string;
          registrationTokenHash: string;
          secretHash: string;
          softwareVersion: string;
          tenantId: string;
          tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
        },
        | { ok: true }
        | {
            error:
              "suspended" | "too_many_apps" | "too_many_clients" | "app_taken";
            ok: false;
          },
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { clientId: string; registrationTokenHash: string },
        { ok: true } | { error: "invalid_token" | "production"; ok: false },
        Name
      >;
      renew: FunctionReference<
        "mutation",
        "internal",
        { clientId: string; now: number; registrationTokenHash: string },
        | {
            appId: string;
            clientName: string;
            createdAt: number;
            ok: true;
            redirectUri: string;
            softwareVersion: string;
            tokenEndpointAuthMethod:
              "client_secret_post" | "client_secret_basic";
          }
        | { error: "invalid_token" | "suspended"; ok: false },
        Name
      >;
      setSuspended: FunctionReference<
        "mutation",
        "internal",
        { now: number; suspended: boolean; tenantId: string },
        null,
        Name
      >;
    };
    signIns: {
      record: FunctionReference<
        "mutation",
        "internal",
        {
          appId: string;
          at: number;
          clientId: string;
          connector: string;
          sub: string;
        },
        null,
        Name
      >;
    };
  };
