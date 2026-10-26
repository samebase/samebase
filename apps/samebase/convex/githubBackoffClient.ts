import { RequestError } from "@octokit/request-error";
import type { Octokit } from "@octokit/rest";
import { isRecord } from "@samebase/dependent";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { vGitHubBackoffPrincipal } from "./githubBackoffModel";

/** Only the resource families used by the shared authenticated clients are classified here. */
function requestResource(path: string): string | null {
  if (path === "/graphql") return "graphql";
  if (path === "/search/code") return "code_search";
  if (path.startsWith("/search/")) return "search";
  if (
    /^\/repos\/[^/]+\/[^/]+(?:$|\/(?:branches|contents|git|pulls|commits|compare|check-runs|statuses)(?:\/|$)|\/actions\/(?:artifacts|runs|workflows|secrets|variables)(?:\/|$))/.test(
      path,
    ) ||
    /^\/orgs\/[^/]+(?:$|\/(?:repos|memberships)(?:\/|$))/.test(path) ||
    /^\/users\/[^/]+$/.test(path) ||
    path === "/user" ||
    /^\/user\/(?:[0-9]+|repos|installations|memberships\/orgs)(?:\/|$)/.test(path) ||
    path === "/installation/repositories"
  )
    return "core";
  return null;
}

function rateLimitMessage(data: unknown): string | null {
  if (!isRecord(data)) return null;
  if (typeof data["message"] === "string" && /rate limit/i.test(data["message"])) {
    return data["message"];
  }
  const errors = data["errors"];
  if (!Array.isArray(errors)) return null;
  for (const error of errors) {
    if (!isRecord(error)) continue;
    const message = error["message"];
    if (error["type"] === "RATE_LIMITED")
      return typeof message === "string" ? message : "rate limit";
    if (
      typeof message === "string" &&
      /(?:secondary rate limit|API rate limit exceeded)/i.test(message)
    )
      return message;
  }
  return null;
}

/**
GitHub headers identify primary resource buckets. Secondary limits do not identify a
single resource, so they pause this provider identity across REST and GraphQL.
*/
export function attachGitHubBackoff(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  octokit: Octokit,
  principal: Infer<typeof vGitHubBackoffPrincipal>,
): Octokit {
  const observe = async (
    status: number,
    headers: Record<string, string | number | undefined>,
    data: unknown,
  ) => {
    const message = rateLimitMessage(data);
    const remaining = headers["x-ratelimit-remaining"];
    const retryAfter = Number(headers["retry-after"]);
    if (![200, 403, 429].includes(status) || (status === 200 && message === null)) return;
    if (status !== 429 && String(remaining) !== "0" && !(retryAfter > 0) && message === null)
      return;
    const resource = headers["x-ratelimit-resource"];
    const primary = String(remaining) === "0" && !/secondary/i.test(message ?? "");
    const resetAt = primary ? Number(headers["x-ratelimit-reset"]) * 1000 : 0;
    const now = Date.now();
    const until =
      Math.max(
        Number.isFinite(resetAt) && resetAt > now ? resetAt : 0,
        Number.isFinite(retryAfter) && retryAfter > 0 ? now + retryAfter * 1000 : 0,
      ) || now + 60_000;
    try {
      await ctx.runMutation(internal.githubBackoff.record, {
        principal: { kind: principal.kind, id: principal.id },
        resource: primary && typeof resource === "string" && resource.length > 0 ? resource : null,
        until,
      });
    } catch {
      // Keep the provider's native response even when the cooldown cannot be stored.
      console.warn("Failed to persist GitHub rate-limit cooldown.");
    }
  };

  octokit.hook.wrap("request", async (request, options) => {
    const requestOptions = octokit.request.endpoint.parse(options);
    const url = new URL(requestOptions.url);
    const cooldown = await ctx.runQuery(internal.githubBackoff.get, {
      principal: { kind: principal.kind, id: principal.id },
      resource: requestResource(url.pathname),
    });
    if (cooldown !== null && cooldown.until > Date.now()) {
      const headers = {
        "retry-after": String(Math.max(1, Math.ceil((cooldown.until - Date.now()) / 1000))),
        "x-ratelimit-reset": String(Math.ceil(cooldown.until / 1000)),
        ...(cooldown.resource === null ? {} : { "x-ratelimit-resource": cooldown.resource }),
      };
      throw new RequestError(
        "GitHub API rate limit exceeded. Retry after the current cooldown.",
        429,
        {
          request: requestOptions,
          response: {
            status: 429,
            url: requestOptions.url,
            headers,
            data: { message: "GitHub API rate limit exceeded." },
          },
        },
      );
    }
    try {
      const response = await request(options);
      const data: unknown = response.data;
      await observe(response.status, response.headers, data);
      return response;
    } catch (error) {
      if (error instanceof RequestError && error.response) {
        await observe(error.status, error.response.headers, error.response.data);
      }
      throw error;
    }
  });
  return octokit;
}
