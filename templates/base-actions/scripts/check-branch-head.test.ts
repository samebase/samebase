import { describe, expect, it } from "vite-plus/test";

import { isBranchHead } from "./check-branch-head.ts";

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

describe("isBranchHead", () => {
  it("accepts a run whose commit is the branch head", async () => {
    const urls: string[] = [];
    await expect(
      isBranchHead(env, (url) => {
        urls.push(url);
        return answer(200, branchPayload)();
      }),
    ).resolves.toBe(true);
    expect(urls).toEqual([
      "https://api.github.com/repos/actions/checkout/branches/test-data%2Fv2%2Fbasic",
    ]);
  });

  it("skips a run after a newer push to the branch", async () => {
    await expect(
      isBranchHead({ ...env, GITHUB_SHA: "0".repeat(40) }, answer(200, branchPayload)),
    ).resolves.toBe(false);
  });

  it("skips a run after the branch is deleted", async () => {
    await expect(isBranchHead(env, answer(404, { message: "Branch not found" }))).resolves.toBe(
      false,
    );
  });

  it("fails on any other GitHub answer", async () => {
    await expect(isBranchHead(env, answer(500, {}))).rejects.toThrow("GitHub answered 500");
    await expect(
      isBranchHead(env, answer(200, { ...branchPayload, commit: { url: "" } })),
    ).rejects.toThrow("no head commit");
  });

  it("fails without the run identity", async () => {
    await expect(isBranchHead({ ...env, BRANCH: "" }, answer(200, branchPayload))).rejects.toThrow(
      "must be set",
    );
  });
});
