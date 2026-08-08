import { describe, expect, it, vi } from "vite-plus/test";

import {
  fetchVerifiedGitHubOAuthProfile,
  GITHUB_SIGN_IN_AUTHORIZATION_PARAMS,
  readGitHubSignInProfile,
} from "./githubSignIn";

// Source: https://api.github.com/users/octocat
// Captured 2026-08-08. This is the live public user payload. Its null email models a private profile.
const githubUserFixture = {
  login: "octocat",
  id: 583231,
  node_id: "MDQ6VXNlcjU4MzIzMQ==",
  avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4",
  gravatar_id: "",
  url: "https://api.github.com/users/octocat",
  html_url: "https://github.com/octocat",
  followers_url: "https://api.github.com/users/octocat/followers",
  following_url: "https://api.github.com/users/octocat/following{/other_user}",
  gists_url: "https://api.github.com/users/octocat/gists{/gist_id}",
  starred_url: "https://api.github.com/users/octocat/starred{/owner}{/repo}",
  subscriptions_url: "https://api.github.com/users/octocat/subscriptions",
  organizations_url: "https://api.github.com/users/octocat/orgs",
  repos_url: "https://api.github.com/users/octocat/repos",
  events_url: "https://api.github.com/users/octocat/events{/privacy}",
  received_events_url: "https://api.github.com/users/octocat/received_events",
  type: "User",
  user_view_type: "public",
  site_admin: false,
  name: "The Octocat",
  company: "@github",
  blog: "https://github.blog",
  location: "San Francisco",
  email: null,
  hireable: null,
  bio: null,
  twitter_username: null,
  public_repos: 8,
  public_gists: 8,
  followers: 23577,
  following: 9,
  created_at: "2011-01-25T18:44:36Z",
  updated_at: "2026-07-22T11:29:09Z",
};

// Source: https://docs.github.com/en/rest/users/emails#set-primary-email-visibility-for-the-authenticated-user
// Captured 2026-08-08. GitHub documents this shape for a private primary email.
const githubPrivatePrimaryEmailFixture = {
  email: "octocat@github.com",
  primary: true,
  verified: true,
  visibility: "private",
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function githubFetch({
  profile = githubUserFixture,
  emails = [githubPrivatePrimaryEmailFixture],
  profileStatus = 200,
  emailsStatus = 200,
}: {
  profile?: unknown;
  emails?: unknown;
  profileStatus?: number;
  emailsStatus?: number;
} = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    switch (url.pathname) {
      case "/user":
        return jsonResponse(profile, profileStatus);
      case "/user/emails":
        return jsonResponse(emails, emailsStatus);
      default:
        throw new Error(`Unexpected GitHub request: ${url.pathname}`);
    }
  });
}

describe("GitHub sign-in", () => {
  it("uses only the account picker and the two required read scopes", () => {
    expect(GITHUB_SIGN_IN_AUTHORIZATION_PARAMS).toEqual({
      prompt: "select_account",
      scope: "read:user user:email",
    });
  });

  it("uses the private primary verified email instead of the public profile email", async () => {
    const fetchMock = githubFetch();

    const rawProfile = await fetchVerifiedGitHubOAuthProfile({
      accessToken: "github-access-token",
      fetch: fetchMock,
    });

    expect(rawProfile).toEqual({
      ...githubUserFixture,
      email: "octocat@github.com",
      samebaseEmailVerified: true,
    });
    expect(readGitHubSignInProfile(rawProfile)).toEqual({
      providerAccountId: "583231",
      login: "octocat",
      name: "The Octocat",
      email: "octocat@github.com",
      image: "https://avatars.githubusercontent.com/u/583231?v=4",
    });

    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer github-access-token",
      "User-Agent": "samebase",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.github.com/user", { headers });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.github.com/user/emails", {
      headers,
    });
  });

  it.each([
    [
      "missing",
      [
        {
          ...githubPrivatePrimaryEmailFixture,
          primary: false,
        },
      ],
    ],
    [
      "unverified",
      [
        {
          ...githubPrivatePrimaryEmailFixture,
          verified: false,
        },
      ],
    ],
  ])("rejects a %s primary verified email", async (_label, emails) => {
    await expect(
      fetchVerifiedGitHubOAuthProfile({
        accessToken: "github-access-token",
        fetch: githubFetch({ emails }),
      }),
    ).rejects.toThrow("GitHub did not provide one primary verified email address.");
  });

  it("rejects a malformed email response", async () => {
    await expect(
      fetchVerifiedGitHubOAuthProfile({
        accessToken: "github-access-token",
        fetch: githubFetch({ emails: { email: "octocat@github.com" } }),
      }),
    ).rejects.toThrow("GitHub returned an invalid email list.");
  });

  it("rejects multiple primary verified emails", async () => {
    await expect(
      fetchVerifiedGitHubOAuthProfile({
        accessToken: "github-access-token",
        fetch: githubFetch({
          emails: [
            githubPrivatePrimaryEmailFixture,
            {
              ...githubPrivatePrimaryEmailFixture,
              email: "octocat@example.com",
            },
          ],
        }),
      }),
    ).rejects.toThrow("GitHub did not provide one primary verified email address.");
  });

  it.each([
    [
      "a malformed user ID",
      {
        ...githubUserFixture,
        id: "octocat",
        email: githubPrivatePrimaryEmailFixture.email,
        samebaseEmailVerified: true,
      },
      "GitHub did not provide a valid user ID.",
    ],
    [
      "a missing verification marker",
      {
        ...githubUserFixture,
        email: githubPrivatePrimaryEmailFixture.email,
      },
      "GitHub did not verify the primary email address.",
    ],
    [
      "a malformed username",
      {
        ...githubUserFixture,
        login: null,
        email: githubPrivatePrimaryEmailFixture.email,
        samebaseEmailVerified: true,
      },
      "GitHub did not provide a username.",
    ],
    [
      "a malformed email",
      {
        ...githubUserFixture,
        email: null,
        samebaseEmailVerified: true,
      },
      "GitHub did not provide a primary email address.",
    ],
  ])("rejects %s in the combined profile", (_label, profile, message) => {
    expect(() => readGitHubSignInProfile(profile)).toThrow(message);
  });

  it.each([
    [401, 200, "GitHub did not provide the user profile."],
    [200, 403, "GitHub did not provide email access."],
  ])(
    "rejects GitHub API failure statuses %i and %i",
    async (profileStatus, emailsStatus, message) => {
      await expect(
        fetchVerifiedGitHubOAuthProfile({
          accessToken: "github-access-token",
          fetch: githubFetch({ profileStatus, emailsStatus }),
        }),
      ).rejects.toThrow(message);
    },
  );
});
