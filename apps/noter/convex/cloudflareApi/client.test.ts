import { describe, expect, it } from "vite-plus/test";

import { cloudflareApiResponseValidators } from "./validators.generated";

describe("Cloudflare API response validators", () => {
  it("accepts Workers Builds trigger lists", () => {
    const validate =
      cloudflareApiResponseValidators.GET[
        "/accounts/{account_id}/builds/workers/{external_script_id}/triggers"
      ];

    expect(
      validate({
        success: true,
        errors: [],
        messages: [],
        result: [],
      }),
    ).toBe(true);
  });
});
