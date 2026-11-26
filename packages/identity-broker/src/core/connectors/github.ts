import { Option, Predicate, Schema } from "effect";
import * as oauth from "oauth4webapi";
import type { UpstreamIdentity } from "./types.ts";
import { oauthFetch, type FetchFunction } from "./upstream.ts";

const USER_URL = "https://api.github.com/user";
const EMAILS_URL = "https://api.github.com/user/emails";

async function githubJson(
  accessToken: string,
  url: string,
  fetch: FetchFunction,
): Promise<unknown> {
  const response = await oauth.protectedResourceRequest(
    accessToken,
    "GET",
    new URL(url),
    new Headers({ Accept: "application/vnd.github+json", "User-Agent": "identity-broker" }),
    null,
    { [oauth.customFetch]: oauthFetch(fetch) },
  );
  if (!response.ok) {
    throw new Error(`GitHub ${url} answered ${response.status}`);
  }
  return await response.json();
}

/** The account id of GitHub's `/user`: a number today, a string accepted. */
const decodeUserId = Schema.decodeUnknownOption(
  Schema.Struct({ id: Schema.Union([Schema.Number, Schema.String]) }),
);

/**
 * The GitHub user and a verified email. GitHub's `/user` email is whatever the user made public,
 * so the verified primary address from `/user/emails` is used instead; a user with no verified
 * address gets no email claim.
 */
export async function githubIdentity(
  accessToken: string,
  fetch: FetchFunction,
): Promise<UpstreamIdentity> {
  const body = await githubJson(accessToken, USER_URL, fetch);
  const id = decodeUserId(body);
  if (Option.isNone(id)) {
    throw new Error("GitHub /user returned no id");
  }
  // Each profile member is kept when it has its type and left out when it does not.
  const identity: UpstreamIdentity = { upstreamId: String(id.value.id) };
  const user: { readonly [member: string]: unknown } = Predicate.isObject(body) ? body : {};
  const name = user["name"] ?? user["login"];
  if (Predicate.isString(name) && name.length > 0) {
    identity.name = name;
  }
  if (Predicate.isString(user["avatar_url"])) {
    identity.picture = user["avatar_url"];
  }
  const emails = await githubJson(accessToken, EMAILS_URL, fetch);
  if (Array.isArray(emails)) {
    const verified = emails
      .filter(Predicate.isObject)
      .filter((entry) => entry["verified"] === true);
    const primary = verified.find((entry) => entry["primary"] === true) ?? verified[0];
    if (primary !== undefined && Predicate.isString(primary["email"])) {
      identity.email = primary["email"];
      identity.emailVerified = true;
    }
  }
  return identity;
}
