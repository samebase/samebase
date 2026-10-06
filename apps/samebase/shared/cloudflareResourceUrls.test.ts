import { describe, expect, it } from "vite-plus/test";

import { buildCloudflareCiApiTokenUrl } from "./cloudflareResourceUrls";

describe("buildCloudflareCiApiTokenUrl", () => {
  it("encodes the CI permission groups, the account, and the token name", () => {
    const url = buildCloudflareCiApiTokenUrl({
      accountId: "9a7806061c88ada191ed06f989cc3dac",
      tokenName: "samebase actions ci samebase",
    });

    expect(url).toBe(
      "https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22secrets_store%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%5D&accountId=9a7806061c88ada191ed06f989cc3dac&name=samebase+actions+ci+samebase",
    );
    const params = new URL(url).searchParams;
    expect(JSON.parse(params.get("permissionGroupKeys") ?? "null")).toEqual([
      { key: "workers_scripts", type: "edit" },
      { key: "secrets_store", type: "edit" },
      { key: "account_settings", type: "read" },
    ]);
    expect(params.get("name")).toBe("samebase actions ci samebase");
  });
});
