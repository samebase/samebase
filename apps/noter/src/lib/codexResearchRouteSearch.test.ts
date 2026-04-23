import { describe, expect, it } from "vite-plus/test";
import {
  buildCodexResearchRouteSearch,
  validateCodexResearchRouteSearch,
} from "@/lib/codexResearchRouteSearch";

describe("codexResearchRouteSearch", () => {
  it("trims the selected thread id when validating route search", () => {
    expect(
      validateCodexResearchRouteSearch({
        threadId: "  thread_123  ",
      }),
    ).toEqual({
      threadId: "thread_123",
    });
  });

  it("omits an empty selected thread id when building route search", () => {
    expect(buildCodexResearchRouteSearch("   ")).toEqual({});
  });
});
