import { describe, expect, it } from "vitest";

import { normalizeGitHubRepositoryListItem } from "./github";

describe("normalizeGitHubRepositoryListItem", () => {
  it("drops extra fields from GitHub repository payloads", () => {
    const normalized = normalizeGitHubRepositoryListItem({
      id: 1021726325,
      name: "noter",
      full_name: "nicu-chiciuc/noter",
      html_url: "https://github.com/nicu-chiciuc/noter",
      description: null,
      private: true,
      fork: false,
      created_at: "2025-07-17T21:10:37Z",
      updated_at: "2026-03-08T12:43:20Z",
      language: "TypeScript",
      stargazers_count: 0,
      forks_count: 0,
      allow_forking: true,
      owner: { login: "nicu-chiciuc" },
    });

    expect(normalized).toEqual({
      id: 1021726325,
      name: "noter",
      full_name: "nicu-chiciuc/noter",
      html_url: "https://github.com/nicu-chiciuc/noter",
      description: null,
      private: true,
      fork: false,
      created_at: "2025-07-17T21:10:37Z",
      updated_at: "2026-03-08T12:43:20Z",
      language: "TypeScript",
      stargazers_count: 0,
      forks_count: 0,
    });
  });
});
