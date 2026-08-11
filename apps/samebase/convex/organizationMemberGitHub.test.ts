import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  parseGitHubInvitationTarget,
  parseGitHubOrganizationRelationship,
  readPublicGitHubUserByLogin,
} from "./organizationMemberGitHub";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Source: https://api.github.com/users/octocat
// Captured 2026-08-08. Negative cases mutate this real provider payload.
function githubUser(overrides?: Record<string, unknown>) {
  return {
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
    ...overrides,
  };
}

// Source: https://docs.github.com/en/rest/orgs/members#list-organization-memberships-for-the-authenticated-user
// Captured 2026-08-07. Negative cases mutate this official provider example.
function githubMembership(overrides?: Record<string, unknown>) {
  return {
    url: "https://api.github.com/orgs/octocat/memberships/defunkt",
    state: "active",
    role: "admin",
    organization_url: "https://api.github.com/orgs/octocat",
    direct_membership: true,
    enterprise_teams_providing_indirect_membership: [],
    organization: {
      login: "github",
      id: 1,
      node_id: "MDEyOk9yZ2FuaXphdGlvbjE=",
      url: "https://api.github.com/orgs/github",
    },
    user: {
      login: "octocat",
      id: 1,
      node_id: "MDQ6VXNlcjE=",
      avatar_url: "https://github.com/images/error/octocat_happy.gif",
      url: "https://api.github.com/users/octocat",
      html_url: "https://github.com/octocat",
      type: "User",
      site_admin: false,
    },
    ...overrides,
  };
}

describe("organization member GitHub responses", () => {
  it("parses only a stable GitHub user with an HTTPS avatar", () => {
    expect(parseGitHubInvitationTarget(githubUser())).toEqual({
      expectedGithubAccountId: "583231",
      githubLogin: "octocat",
      githubAvatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4",
    });
    expect(() => parseGitHubInvitationTarget(githubUser({ type: "Organization" }))).toThrow(
      "Only a GitHub user can be invited.",
    );
    expect(() =>
      parseGitHubInvitationTarget(githubUser({ id: Number.MAX_SAFE_INTEGER + 1 })),
    ).toThrow("GitHub returned an invalid user ID.");
    expect(() =>
      parseGitHubInvitationTarget(githubUser({ avatar_url: "http://example.com/avatar.png" })),
    ).toThrow("GitHub returned an invalid user avatar URL.");
  });

  it("maps only a matching active GitHub organization membership", () => {
    const expected = { githubOrganizationId: "1", githubAccountId: "1" };
    expect(parseGitHubOrganizationRelationship(githubMembership(), expected)).toBe(
      "organization_owner",
    );
    expect(
      parseGitHubOrganizationRelationship(githubMembership({ role: "member" }), expected),
    ).toBe("organization_member");
    expect(
      parseGitHubOrganizationRelationship(githubMembership({ state: "pending" }), expected),
    ).toBe("not_in_organization");
    expect(() =>
      parseGitHubOrganizationRelationship(githubMembership(), {
        githubOrganizationId: "2",
        githubAccountId: "1",
      }),
    ).toThrow("GitHub organization membership did not match the requested identities.");
  });

  it("uses the closed unauthenticated GitHub user request", async () => {
    const fetch = vi.fn(async () => Response.json(githubUser()));
    vi.stubGlobal("fetch", fetch);
    await expect(readPublicGitHubUserByLogin("octocat")).resolves.toMatchObject({
      expectedGithubAccountId: "583231",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/users/octocat",
      expect.objectContaining({
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": expect.stringContaining("samebase-app octokit-rest.js/"),
          "x-github-api-version": "2022-11-28",
        },
        method: "GET",
      }),
    );
  });

  it("maps unauthenticated GitHub user request failures", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ message: "Not Found" }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ message: "Unavailable" }, { status: 503 }));
    vi.stubGlobal("fetch", fetch);

    await expect(readPublicGitHubUserByLogin("missing-user")).rejects.toThrow(
      "GitHub user not found.",
    );
    await expect(readPublicGitHubUserByLogin("octocat")).rejects.toThrow(
      "GitHub user lookup is unavailable.",
    );
  });
});
