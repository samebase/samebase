import { normalizeAccountEmail } from "../shared/accountPresentation";
import {
  asRecord,
  readBoolean,
  readString,
  readStringOrNumber,
  type JsonRecord,
} from "./jsonUtils";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

export const GITHUB_SIGN_IN_AUTHORIZATION_PARAMS = {
  prompt: "select_account",
  scope: "read:user user:email",
} as const;

type GitHubSignInProfile = {
  providerAccountId: string;
  login: string;
  name: string;
  email: string;
  image?: string;
};

function readRequiredTrimmedString(record: JsonRecord, key: string, label: string): string {
  const value = readString(record, key)?.trim();
  if (!value) {
    throw new Error(`GitHub did not provide ${label}.`);
  }
  return value;
}

function readPrimaryVerifiedEmail(value: unknown): string {
  if (!Array.isArray(value)) {
    throw new Error("GitHub returned an invalid email list.");
  }

  const primaryVerifiedEmails: string[] = [];
  for (const entry of value) {
    const email = asRecord(entry);
    if (readBoolean(email, "primary") === true && readBoolean(email, "verified") === true) {
      const address = readString(email, "email")?.trim();
      if (address) {
        primaryVerifiedEmails.push(normalizeAccountEmail(address));
      }
    }
  }

  if (primaryVerifiedEmails.length !== 1) {
    throw new Error("GitHub did not provide one primary verified email address.");
  }
  return primaryVerifiedEmails[0];
}

function githubApiHeaders(accessToken: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "samebase",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

export async function fetchVerifiedGitHubOAuthProfile(args: {
  accessToken: string;
  fetch: typeof fetch;
}): Promise<JsonRecord> {
  const headers = githubApiHeaders(args.accessToken);
  const [profileResponse, emailsResponse] = await Promise.all([
    args.fetch(`${GITHUB_API_URL}/user`, { headers }),
    args.fetch(`${GITHUB_API_URL}/user/emails`, { headers }),
  ]);
  if (!profileResponse.ok) {
    throw new Error("GitHub did not provide the user profile.");
  }
  if (!emailsResponse.ok) {
    throw new Error("GitHub did not provide email access.");
  }

  const rawProfile: unknown = await profileResponse.json();
  const rawEmails: unknown = await emailsResponse.json();
  return {
    ...asRecord(rawProfile),
    email: readPrimaryVerifiedEmail(rawEmails),
    samebaseEmailVerified: true,
  };
}

export function readGitHubSignInProfile(value: unknown): GitHubSignInProfile {
  const profile = asRecord(value);
  const providerAccountId = readStringOrNumber(profile, "id")?.trim();
  if (!providerAccountId || !/^\d+$/.test(providerAccountId)) {
    throw new Error("GitHub did not provide a valid user ID.");
  }
  if (profile["samebaseEmailVerified"] !== true) {
    throw new Error("GitHub did not verify the primary email address.");
  }

  const login = readRequiredTrimmedString(profile, "login", "a username");
  const email = normalizeAccountEmail(
    readRequiredTrimmedString(profile, "email", "a primary email address"),
  );
  const name = readString(profile, "name")?.trim() || login;
  const image = readString(profile, "avatar_url")?.trim();
  return {
    providerAccountId,
    login,
    name,
    email,
    ...(image ? { image } : {}),
  };
}
