import { describe, expect, it } from "vite-plus/test";

import { shouldProceed } from "./check-branch-head.ts";

// Fields of a real GET /repos/actions/checkout/branches/test-data%2Fv2%2Fbasic
// response.
const branchPayload = {
  name: "test-data/v2/basic",
  commit: {
    sha: "82f71901cf8c021332310dcc8cdba84c4193ff5d",
    url: "https://api.github.com/repos/actions/checkout/commits/82f71901cf8c021332310dcc8cdba84c4193ff5d",
  },
  protected: false,
};

const env = {
  BRANCH: "test-data/v2/basic",
  GITHUB_SHA: "82f71901cf8c021332310dcc8cdba84c4193ff5d",
  GITHUB_REPOSITORY: "actions/checkout",
  GITHUB_TOKEN: "token",
  GITHUB_API_URL: "https://api.github.com",
};

const answer = (status: number, body: unknown) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const exists = answer(200, branchPayload);
const deleted = answer(404, { message: "Branch not found" });

describe("shouldProceed", () => {
  it("deploys while the commit of the run is the branch head", async () => {
    const urls: string[] = [];
    await expect(
      shouldProceed("deploy", env, (url) => {
        urls.push(url);
        return exists();
      }),
    ).resolves.toBe(true);
    expect(urls).toEqual([
      "https://api.github.com/repos/actions/checkout/branches/test-data%2Fv2%2Fbasic",
    ]);
  });

  it("skips the deploy after a newer push or a delete", async () => {
    await expect(
      shouldProceed("deploy", { ...env, GITHUB_SHA: "0".repeat(40) }, exists),
    ).resolves.toBe(false);
    await expect(shouldProceed("deploy", env, deleted)).resolves.toBe(false);
  });

  it("destroys while the branch does not exist", async () => {
    await expect(shouldProceed("destroy", env, deleted)).resolves.toBe(true);
  });

  it("skips the destroy when the branch exists again", async () => {
    await expect(
      shouldProceed("destroy", { ...env, GITHUB_SHA: "0".repeat(40) }, exists),
    ).resolves.toBe(false);
  });

  it("fails on any other GitHub answer", async () => {
    for (const mode of ["deploy", "destroy"] as const) {
      await expect(shouldProceed(mode, env, answer(500, {}))).rejects.toThrow(
        "GitHub answered 500",
      );
      await expect(
        shouldProceed(mode, env, answer(200, { ...branchPayload, commit: { url: "" } })),
      ).rejects.toThrow("no head commit");
    }
  });

  it("fails without the run identity", async () => {
    await expect(shouldProceed("destroy", { ...env, BRANCH: "" }, deleted)).rejects.toThrow(
      "must be set",
    );
  });
});
